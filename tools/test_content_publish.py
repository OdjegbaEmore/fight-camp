#!/usr/bin/env python3
"""Checks for content_publish.py's rules. No network, no key.

    python3 tools/test_content_publish.py
"""

import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import content_publish as cp  # noqa: E402

TODAY = dt.date(2026, 9, 13)   # a Sunday, ISO week 37


def story(**kw):
    s = {'url': 'https://example.com/fight-report?utm_source=x#top', 'title': 'Title of a fight report',
         'source': 'Example News', 'category': 'pro', 'published_at': '2026-09-12',
         'summary': 'A summary in our own words about who fought whom and what it means for the division.'}
    s.update(kw)
    return s


class Urls(unittest.TestCase):
    def test_tracking_and_fragment_stripped(self):
        self.assertEqual(cp.norm_url('HTTPS://Example.com/a?id=4&utm_medium=x#frag'), 'https://example.com/a?id=4')

    def test_non_http_refused(self):
        self.assertIsNone(cp.norm_url('javascript:alert(1)'))
        self.assertIsNone(cp.norm_url('not a url'))

    def test_key_ignores_www_scheme_and_slash(self):
        self.assertEqual(cp.url_key('http://www.example.com/a/'), cp.url_key('https://example.com/a'))


class News(unittest.TestCase):
    def test_valid(self):
        row, why = cp.check_news(story(), TODAY, set())
        self.assertIsNone(why)
        self.assertEqual(row['url'], 'https://example.com/fight-report')

    def test_rules(self):
        cases = {
            'no usable': story(url=''),
            'unknown category': story(category='mma'),
            'more than 10 days': story(published_at='2026-08-30'),
            'future': story(published_at='2026-09-20'),
            'no published_at': story(published_at=None),
            'summary must be': story(summary='Too short.'),
            'quotes more than': story(summary='He said "' + ' '.join(['word'] * 14) + '" after the fight, which is a lot.'),
        }
        for expect, item in cases.items():
            row, why = cp.check_news(item, TODAY, set())
            self.assertIsNone(row, expect)
            self.assertIn(expect, why)

    def test_duplicate(self):
        known = {cp.url_key('http://www.example.com/fight-report/')}
        self.assertIn('already', cp.check_news(story(), TODAY, known)[1])

    def test_short_quote_allowed(self):
        self.assertIsNone(cp.check_news(story(summary='The champion called it "a statement win" and the division '
                                                      'now has a clear top contender for the spring.'), TODAY, set())[1])


class Tips(unittest.TestCase):
    base = {'category': 'footwork', 'title': 'Step off after the jab',
            'body': 'After you land the jab, take one step to your lead side before throwing again.'}

    def test_valid_and_category_canonical(self):
        row, why = cp.check_tip(dict(self.base), set())
        self.assertIsNone(why)
        self.assertEqual(row['category'], 'Footwork')
        self.assertEqual(set(row), {'kind', 'category', 'title', 'body', 'attribution', 'year', 'week',
                                    'source_url', 'active'})

    def test_measurement_needs_source(self):
        t = dict(self.base, category='Fuel & Weight', body='Aim for 1.6 g of protein per kg of bodyweight across the day, spread over meals.')
        self.assertIn('measured figure', cp.check_tip(t, set())[1])
        self.assertIsNone(cp.check_tip(dict(t, source_url='https://example.org/study'), set())[1])

    def test_round_counts_need_no_source(self):
        t = dict(self.base, body='Shadowbox 3 rounds focusing only on stepping off after every jab you throw.')
        self.assertIsNone(cp.check_tip(t, set())[1])

    def test_duplicate_title(self):
        self.assertIn('exists', cp.check_tip(dict(self.base), {cp.norm_text('Step off after the JAB!')})[1])


class Quotes(unittest.TestCase):
    def test_needs_source_and_attribution(self):
        q = {'body': '“Float like a butterfly, sting like a bee.”', 'attribution': 'Muhammad Ali'}
        self.assertIn('source_url', cp.check_quote(q, set())[1])
        row, why = cp.check_quote(dict(q, source_url='https://example.org/ali'), set())
        self.assertIsNone(why)
        self.assertEqual(row['body'], 'Float like a butterfly, sting like a bee.')
        self.assertIn('attribution', cp.check_quote(dict(q, attribution='', source_url='https://e.org/x'), set())[1])


class Focus(unittest.TestCase):
    ctx = {'focus_needed': [{'year': 2026, 'week': 38, 'monday': '2026-09-14',
                             'classes_booked': {'count': 9, 'classes': ['Mon 06:30 Archetype Boxing']}}],
           'weight': {'change_28d': {'lb': -2.5}}, 'training': [{'minutes': 412}]}

    def item(self, **kw):
        f = {'year': 2026, 'week': 38, 'title': 'Keep the jab sharp',
             'body': 'Nine classes booked. Double the jab before every combination and reset your guard.'}
        f.update(kw)
        return f

    def test_numbers_must_come_from_data(self):
        pool = cp.collect_numbers([self.ctx['focus_needed'], self.ctx['training'], self.ctx['weight']])
        weeks = {(2026, 37), (2026, 38)}
        self.assertIsNone(cp.check_focus(self.item(body='9 classes booked and down 2.5 lb in four weeks. Stay patient behind the jab.'), weeks, pool)[1])
        self.assertIsNone(cp.check_focus(self.item(body='412 minutes last week. Two 6:30 starts — sleep early and keep 3-round mitt work sharp.'), weeks, pool)[1])
        self.assertIn('not found in your data', cp.check_focus(self.item(body='You are 14 lb from target, so tighten the diet and keep the jab busy.'), weeks, pool)[1])

    def test_week_must_be_open(self):
        self.assertIn('not open', cp.check_focus(self.item(week=40), {(2026, 38)}, set())[1])


class Weeks(unittest.TestCase):
    def test_open_weeks(self):
        self.assertEqual([cp.iso_week(m) for m in cp.open_mondays(TODAY)], [(2026, 38)])        # Sunday: next only
        self.assertEqual([cp.iso_week(m) for m in cp.open_mondays(dt.date(2026, 9, 15))], [(2026, 38)])
        self.assertEqual(len(cp.open_mondays(dt.date(2026, 9, 18))), 2)   # Friday

    def test_quotas(self):
        self.assertEqual(cp.tip_quota(0), 12)
        self.assertEqual(cp.tip_quota(12), 6)
        self.assertEqual(cp.tip_quota(40), 2)
        self.assertEqual(cp.tip_quota(42), 0)
        self.assertEqual(cp.quote_quota(0), 40)
        self.assertEqual(cp.quote_quota(25), 3)
        self.assertEqual(cp.quote_quota(150), 0)

    def test_camp_week(self):
        camps = [{'name': 'Winter', 'start_date': '2026-09-13', 'end_date': '2026-12-23', 'target_weight': 225, 'archived': False}]
        c = cp.camp_for_week(camps, dt.date(2026, 9, 21))
        self.assertEqual((c['week_of_camp'], c['weeks_in_camp']), (2, 15))
        self.assertIsNone(cp.camp_for_week(camps, dt.date(2026, 8, 31)))


if __name__ == '__main__':
    unittest.main()
