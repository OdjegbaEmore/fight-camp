// Cookbook and meal-plan seed data.
//
// Transcribed from the user's own documents, one level above the repo:
//   Fight_Camp_Meal_Plan_v2.docx   — 1,513 kcal / 169g protein
//   Ring_Training_Dinner_Plan.docx — ~2,100 kcal, six dinners + top-ups
//
// Macros are the documents' own figures, not recomputed from ingredients. They
// were derived against real DEXA numbers (6/18 and 8/31 BodySpec scans) and the
// documents are the authority; recalculating would silently disagree with the
// plan the user is actually following.

export const SEED_RECIPES = [
  // ── Fight Camp Meal Plan v2 ──────────────────────────────────────────────
  {
    name: 'Fruit + Black Coffee',
    meal: 'breakfast',
    description: 'Before the AM session. Rotate the fruit — apple, orange and pear all land in the same ~95-105 cal / ~25g carb range. Keep it to one piece so the daily total holds.',
    servings: 1, kcal: 105, protein: 1, fat: 0, carb: 27,
    source: 'Fight Camp Meal Plan v2',
    ingredients: [
      { item: 'Banana, medium', amount: '~118g' },
      { item: 'Black coffee', amount: '1 cup' }
    ],
    steps: []
  },
  {
    name: 'Turkey Taco Bowl',
    meal: 'lunch',
    description: 'Lunch on the fight camp plan. Cauliflower rice instead of starch.',
    servings: 1, kcal: 705, protein: 88, fat: 27, carb: 28,
    source: 'Fight Camp Meal Plan v2',
    ingredients: [
      { item: '99% lean ground turkey breast', amount: '9 oz (255g), cooked weight' },
      { item: 'Cauliflower rice', amount: '2 cups, sautéed' },
      { item: 'Bell pepper, sliced', amount: '1 cup' },
      { item: 'Onion, diced', amount: '1/2 cup' },
      { item: 'Avocado', amount: '1/4, sliced' },
      { item: 'Olive oil', amount: '2 tsp, divided' },
      { item: 'Cotija cheese, crumbled', amount: '2 tbsp' },
      { item: 'Seasoning', amount: 'Chili powder, cumin, garlic powder, salt, pepper, lime juice' }
    ],
    steps: [
      'Heat 1 tsp olive oil in a large skillet over medium-high. Add turkey, breaking it up, and cook through, ~6-8 min. Season with chili powder, cumin, garlic powder, salt, and pepper as it cooks.',
      'Push turkey to one side; add remaining oil, onion, and bell pepper. Sauté 4-5 min until softened.',
      'Stir in cauliflower rice and cook 2-3 min until warmed through. Plate, top with avocado, cotija, and a squeeze of lime.'
    ]
  },
  {
    name: 'Pork Tenderloin & Roasted Veggie Skillet',
    meal: 'dinner',
    description: 'Dinner on the fight camp plan. No starch — Brussels sprouts and asparagus carry it.',
    servings: 1, kcal: 703, protein: 80, fat: 33, carb: 24,
    source: 'Fight Camp Meal Plan v2',
    ingredients: [
      { item: 'Pork tenderloin, trimmed', amount: '9 oz (255g), cooked weight' },
      { item: 'Brussels sprouts, halved', amount: '2 cups' },
      { item: 'Asparagus, trimmed', amount: '1 cup' },
      { item: 'Olive oil', amount: '2 tsp' },
      { item: 'Butter', amount: '1 tbsp, for finishing' },
      { item: 'Grated Parmesan', amount: '2 tbsp' },
      { item: 'Seasoning', amount: 'Garlic, rosemary or thyme, salt, pepper' }
    ],
    steps: [
      'Preheat oven to 425°F. Toss Brussels sprouts and asparagus with olive oil, salt, and pepper. Roast 18-20 min, adding asparagus in the last 8 min so it doesn’t overcook.',
      'Pat pork tenderloin dry, season with garlic, rosemary/thyme, salt, and pepper. Sear in an oven-safe skillet over high heat, ~2-3 min per side, then finish in the oven at 425°F for 12-15 min until internal temp hits 145°F. Rest 5 min before slicing.',
      'Swirl butter into the hot skillet, spoon over sliced pork. Plate over the roasted veggies and top with Parmesan.'
    ]
  },

  // ── Ring Training Prep — dinners ─────────────────────────────────────────
  {
    name: 'Steak & Sweet Potato Skillet',
    meal: 'dinner',
    description: 'Ring training dinner. Carbs are back in — sweet potato around training supports recovery.',
    servings: 1, kcal: 867, protein: 89, fat: 35, carb: 48,
    source: 'Ring Training Prep',
    ingredients: [
      { item: 'Lean sirloin steak, trimmed', amount: '10 oz (280g), cooked weight' },
      { item: 'Sweet potato', amount: '1 large (~200g), cubed and roasted' },
      { item: 'Asparagus, trimmed', amount: '1 bunch (~150g cooked)' },
      { item: 'Olive oil', amount: '2 tsp, divided' },
      { item: 'Seasoning', amount: 'Garlic powder, smoked paprika, salt, pepper' }
    ],
    steps: [
      'Toss cubed sweet potato with 1 tsp olive oil, salt, and pepper. Roast at 425°F for 20-25 min, flipping once.',
      'Season steak with garlic powder, paprika, salt, and pepper. Sear in remaining 1 tsp oil over high heat, ~3-4 min per side for medium, then rest 5 min before slicing.',
      'In the same pan, sauté asparagus 4-5 min until crisp-tender. Plate everything together.'
    ]
  },
  {
    name: 'Salmon & Rice Bowl',
    meal: 'dinner',
    description: 'Ring training dinner. Lowest protein of the six — pair with a bigger top-up.',
    servings: 1, kcal: 806, protein: 57, fat: 34, carb: 66,
    source: 'Ring Training Prep',
    ingredients: [
      { item: 'Salmon fillet', amount: '7.75 oz (220g), cooked weight' },
      { item: 'White rice, cooked', amount: '1 cup (~200g)' },
      { item: 'Broccoli florets', amount: '2 cups (~150g cooked)' },
      { item: 'Olive oil', amount: '1 tsp' },
      { item: 'Seasoning', amount: 'Soy sauce or tamari, sesame seeds, lime wedge' }
    ],
    steps: [
      'Pat salmon dry, season with salt and pepper. Pan-sear skin-side down in olive oil, 4-5 min, flip and cook 3-4 min more.',
      'Steam broccoli 5-6 min until bright green and tender.',
      'Serve over rice, drizzle with a little soy sauce, sesame seeds, and a squeeze of lime.'
    ]
  },
  {
    name: 'Chicken Fajita Bowl',
    meal: 'dinner',
    description: 'Ring training dinner.',
    servings: 1, kcal: 876, protein: 91, fat: 26, carb: 64,
    source: 'Ring Training Prep',
    ingredients: [
      { item: 'Boneless, skinless chicken breast', amount: '9.2 oz (260g), cooked weight' },
      { item: 'Bell pepper, sliced', amount: '1.5 peppers (~150g)' },
      { item: 'Onion, sliced', amount: '1/2 medium (~80g)' },
      { item: 'White rice, cooked', amount: '3/4 cup (~150g)' },
      { item: 'Avocado', amount: '1/4, sliced' },
      { item: 'Cotija cheese, crumbled', amount: '2 tbsp' },
      { item: 'Olive oil', amount: '1 tsp' },
      { item: 'Seasoning', amount: 'Chili powder, cumin, garlic powder, salt, pepper, lime juice' }
    ],
    steps: [
      'Season chicken with chili powder, cumin, garlic powder, salt, and pepper. Grill or pan-sear ~6-7 min per side until 165°F internal, then slice.',
      'Sauté peppers and onion in olive oil over medium-high, 5-6 min until softened with some char.',
      'Build the bowl over rice, top with avocado, cotija, and a squeeze of lime.'
    ]
  },
  {
    name: 'Turkey & Black Bean Chili Skillet',
    meal: 'dinner',
    description: 'Ring training dinner. Highest protein and lowest fat of the six.',
    servings: 1, kcal: 704, protein: 100, fat: 12, carb: 50,
    source: 'Ring Training Prep',
    ingredients: [
      { item: '99% lean ground turkey breast', amount: '9.9 oz (280g), cooked weight' },
      { item: 'Black beans, drained and rinsed', amount: '3/4 cup (~130g)' },
      { item: 'Diced tomatoes (canned)', amount: '1 cup' },
      { item: 'Bell pepper, diced', amount: '1 medium (~100g)' },
      { item: 'Onion, diced', amount: '1/3 cup (~60g)' },
      { item: 'Cotija cheese, crumbled', amount: '1 tbsp' },
      { item: 'Olive oil', amount: '1 tsp' },
      { item: 'Seasoning', amount: 'Chili powder, cumin, garlic powder, salt, pepper' }
    ],
    steps: [
      'Brown turkey in olive oil over medium-high heat, breaking it up as it cooks, ~6-8 min. Season with chili powder, cumin, garlic powder, salt, and pepper.',
      'Add onion and bell pepper, cook 4-5 min until softened.',
      'Stir in black beans and diced tomatoes, simmer 8-10 min until thickened. Top with cotija.'
    ]
  },
  {
    name: 'Shrimp & Quinoa Bowl',
    meal: 'dinner',
    description: 'Ring training dinner.',
    servings: 1, kcal: 755, protein: 98, fat: 23, carb: 42,
    source: 'Ring Training Prep',
    ingredients: [
      { item: 'Shrimp, peeled and deveined', amount: '12 oz (340g), cooked weight' },
      { item: 'Quinoa, cooked', amount: '3/4 cup (~160g)' },
      { item: 'Zucchini, diced', amount: '1 medium (~120g)' },
      { item: 'Fresh spinach', amount: '2 cups (~60g)' },
      { item: 'Feta cheese, crumbled', amount: '1.5 oz (~3 tbsp)' },
      { item: 'Olive oil', amount: '2 tsp, divided' },
      { item: 'Seasoning', amount: 'Garlic, oregano, salt, pepper, lime or lemon juice' }
    ],
    steps: [
      'Season shrimp with garlic powder, salt, and pepper. Sauté in 1 tsp olive oil over medium-high, 2-3 min per side until pink and opaque.',
      'In the same pan, sauté zucchini in remaining oil 3-4 min, then wilt in spinach for 1-2 min.',
      'Serve shrimp and veggies over quinoa, top with feta and a squeeze of citrus.'
    ]
  },
  {
    name: 'Pork Tenderloin & Roasted Veggies',
    meal: 'dinner',
    description: 'Ring training dinner. The fight camp pork scaled up with potatoes added back.',
    servings: 1, kcal: 792, protein: 92, fat: 28, carb: 48,
    source: 'Ring Training Prep',
    ingredients: [
      { item: 'Pork tenderloin, trimmed', amount: '11.3 oz (320g), cooked weight' },
      { item: 'Baby potatoes, halved', amount: '10-12 (~200g)' },
      { item: 'Brussels sprouts, halved', amount: '2 cups (~150g)' },
      { item: 'Olive oil', amount: '2 tsp, divided' },
      { item: 'Seasoning', amount: 'Garlic, rosemary or thyme, salt, pepper' }
    ],
    steps: [
      'Toss potatoes and Brussels sprouts with 1 tsp olive oil, salt, and pepper. Roast at 425°F for 25-30 min, flipping halfway.',
      'Season pork tenderloin with garlic, rosemary, salt, and pepper. Sear in remaining oil 2-3 min per side, then finish in the oven at 425°F for 12-15 min until 145°F internal.',
      'Rest pork 5 min, slice, and plate with the roasted vegetables.'
    ]
  },

  // ── Evening protein top-ups ──────────────────────────────────────────────
  {
    name: 'Cottage Cheese & Berries',
    meal: 'extra',
    description: 'Evening protein top-up. Pick whichever fits the calorie room left.',
    servings: 1, kcal: 215, protein: 28, fat: 2, carb: 19,
    source: 'Ring Training Prep',
    ingredients: [
      { item: 'Cottage cheese, low-fat', amount: '1 cup' },
      { item: 'Berries', amount: '1/2 cup' }
    ],
    steps: []
  },
  {
    name: 'Whey Protein Shake',
    meal: 'extra',
    description: 'Evening protein top-up. Lowest calorie of the three.',
    servings: 1, kcal: 150, protein: 26, fat: 3, carb: 4,
    source: 'Ring Training Prep',
    ingredients: [
      { item: 'Whey protein', amount: '1 scoop' },
      { item: 'Unsweetened almond milk', amount: '8 oz' }
    ],
    steps: []
  },
  {
    name: 'Greek Yogurt & Honey',
    meal: 'extra',
    description: 'Evening protein top-up.',
    servings: 1, kcal: 200, protein: 22, fat: 4, carb: 19,
    source: 'Ring Training Prep',
    ingredients: [
      { item: 'Plain Greek yogurt, 2%', amount: '1 cup' },
      { item: 'Honey', amount: '1 tbsp' }
    ],
    steps: []
  }
];

// Plans reference recipes by NAME here; the importer resolves names to ids after
// the recipes are inserted, so this file stays readable and id-free.
export const SEED_PLANS = [
  {
    name: 'Fight Camp v2',
    description: 'High protein, veggie-forward, no refined or starchy carbs. Fixed fruit + coffee breakfast, two rotating meat options. Built against the 6/18/2026 DEXA.',
    kcalTarget: 1513,
    proteinTarget: 169,
    active: true,
    items: [
      { meal: 'breakfast', name: 'Fruit + Black Coffee' },
      { meal: 'lunch',     name: 'Turkey Taco Bowl' },
      { meal: 'dinner',    name: 'Pork Tenderloin & Roasted Veggie Skillet' }
    ]
  },
  {
    name: 'Ring Training Prep',
    description: 'Dinners plus an evening top-up; breakfast and lunch stay as they are. Carbs kept in to support 6-7 sessions a week. Built against the 8/31/2026 DEXA. Goal 220 lbs by 12/31/26.',
    kcalTarget: 2100,
    proteinTarget: 175,
    active: false,
    items: [
      { meal: 'dinner', name: 'Steak & Sweet Potato Skillet' },
      { meal: 'extra',  name: 'Whey Protein Shake' }
    ]
  }
];
