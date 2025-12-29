import { RestaurantData } from "./types";

export const MIN_ORDER_AMOUNT = 1000;
export const MAX_DELIVERY_RANGE = 5; // Kilometers

export const generateOrderId = () => {
  return 'ORD-' + Math.random().toString(36).substr(2, 9).toUpperCase();
};

export const RESTAURANT_DATA: RestaurantData = {
  "restaurant": {
    "id": "four-seasons-dhanmondi",
    "name": "Four Season Restaurant",
    "description": "Sister concern of X-group Chain Restaurant, offering multi-cuisine menus especially Thai, Chinese and Cultural cuisine.",
    "slogan": "Lavishly decorated dishes with authentic flavors",
    "contact": {
      "phone": "01755636264",
      "email": "4seasons@x-grouprestaurant.com",
      "address": "House No. 59 A, Road No. 16 (new), 27 (old) Satmasjid Road, Dhanmondi, Dhaka-1209"
    },
    "location": {
      "lat": 23.751504401249157,
      "lng": 90.36807718044602
    },
    "hours": {
      "open_days": ["Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
      "season_oct_feb": {
        "lunch": "12:00-15:00",
        "dinner": "18:00-22:30"
      },
      "season_mar_sep": {
        "lunch": "12:00-15:30",
        "dinner": "18:30-22:30"
      }
    },
    "services": [
      "Dine-in",
      "Takeaway",
      "Online Delivery (foodbitebd)",
      "Outside Catering",
      "Corporate Services",
      "Party/Event Hosting"
    ],
    "features": [
      "Multi-cuisine menu",
      "Homely and secured environment",
      "Bangla foods available (min 100 persons)",
      "Continental menu available",
      "Online ordering system"
    ],
    "additional_info": {
      "established": "2007-04-01",
      "trade_license": "Trade/DNCC/095027/2019",
      "online_platform": "foodbitebd"
    }
  },
  "menu": {
    "categories": [
      {
        "id": "chinese",
        "name": "Chinese",
        "description": "Thai, Sze-Chuan, and Chinese delicacies",
        "icon": "🥡",
        "subcategories": [
          {
            "id": "appetizers",
            "name": "Appetizer & Starter",
            "items": [
              { "id": "101", "code": "101", "name": "THAI CHICKEN CASHEW NUT SALAD", "description": "Warm fried cube cut chicken, roasted cashew nut, tomato, onion, coriander & spicy sauce", "price": 745, "currency": "BDT", "tags": ["N", "H"], "spice_level": 2, "prep_time": 15, "popular": true, "image": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=320&fit=crop" },
              { "id": "102", "code": "102", "name": "THAI GRILLED CHICKEN SALAD", "description": "Grilled boneless chicken, carrot, coriander, onion, tomato & spices", "price": 690, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": false, "image": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=320&fit=crop" },
              { "id": "103", "code": "103", "name": "THAI SHRIMPS SALAD", "description": "Shrimp, onion, lemon grass, ginger, red chili flakes & roasted ground rice", "price": 825, "currency": "BDT", "tags": ["S", "H"], "spice_level": 3, "prep_time": 15, "popular": true, "image": "https://images.unsplash.com/photo-1551248429-40975aa4de74?w=400&h=320&fit=crop" },
              { "id": "104", "code": "104", "name": "CLASSIC PRAWN COCKTAIL", "description": "Poached Shrimps, fresh vegetables, boiled eggs with cocktail sauce", "price": 725, "currency": "BDT", "tags": ["S", "V", "new"], "spice_level": 0, "prep_time": 15, "popular": false },
              { "id": "105", "code": "105", "name": "THAI GRILLED BEEF SALAD", "description": "Grilled slice beef, carrot, coriander, onion, tomato & spices", "price": 570, "currency": "BDT", "tags": ["H"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "106", "code": "106", "name": "THAI CHICKEN OR BEEF SATAY", "description": "Spicy grilled chicken or boneless beef skewer serve with peanut sauce", "price": 825, "currency": "BDT", "tags": ["D", "H"], "spice_level": 2, "prep_time": 25, "popular": true },
              { "id": "107", "code": "107", "name": "THAI FISH CAKE", "description": "Minced Tuna fish cooked with spices, egg, flour and served with cucumber & peanut sauce", "price": 825, "currency": "BDT", "tags": ["S"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "108", "code": "108", "name": "THAI SPRING ROLL", "description": "Crispy wrap & fluffy veggies with minced chicken", "price": 570, "currency": "BDT", "tags": ["V"], "spice_level": 1, "prep_time": 15, "popular": true },
              { "id": "109", "code": "109", "name": "THAI SHRIMPS ROLL", "description": "Crispy wrap filled with spiced shrimp", "price": 850, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 15, "popular": false },
              { "id": "110", "code": "110", "name": "SZE-CHUAN CHICKEN & PRAWN SALAD", "description": "Spicy sliced chicken & prawn, roasted cashew nut, coriander, onion & tomato", "price": 685, "currency": "BDT", "tags": ["N", "S"], "spice_level": 3, "prep_time": 15, "popular": false },
              { "id": "111", "code": "111", "name": "SZE-CHUAN CHICKEN SALAD", "description": "Spicy sliced chicken, roasted cashew nut, coriander, onion & tomato", "price": 685, "currency": "BDT", "tags": ["N", "H"], "spice_level": 3, "prep_time": 15, "popular": false },
              { "id": "112", "code": "112", "name": "SZE-CHUAN PRAWN SALAD", "description": "Spicy prawn, roasted cashew nut, coriander, onion & tomato", "price": 785, "currency": "BDT", "tags": ["N", "S"], "spice_level": 3, "prep_time": 15, "popular": false },
              { "id": "113", "code": "113", "name": "SHRIMPS ORANGE & APPLE SALAD", "description": "Poached Shrimps, fresh vegetables & fresh fruits mixed with Honey mustard orange sauce", "price": 725, "currency": "BDT", "tags": ["S", "H", "new"], "spice_level": 0, "prep_time": 15, "popular": false },
              { "id": "114", "code": "114", "name": "FRIED WONTONS", "description": "Crispy wrap stuffed with minced chicken, prawn & carrot", "price": 570, "currency": "BDT", "tags": [], "spice_level": 1, "prep_time": 15, "popular": true, "image": "https://images.unsplash.com/photo-1626202348347-167bb3093259?w=400&h=320&fit=crop" },
              { "id": "115", "code": "115", "name": "DUMPLING", "description": "Steamed soft dough stuffed with minced chicken, mushroom, baby corn, carrot & herbs", "price": 825, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": true },
              { "id": "116", "code": "116", "name": "SHRIMPS ON TOAST", "description": "Deep fried herbs mixed with minced Shrimp on sliced loaf", "price": 825, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 15, "popular": false },
              { "id": "117", "code": "117", "name": "FRIED PRAWN BALL PALATE", "description": "Deep fried coated balls stuffed with herby minced prawn", "price": 885, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "118", "code": "118", "name": "BATTER DEEP FRIED PRAWNS", "description": "Mild & fluffy deep fried egg mixed with battered spice prawn", "price": 950, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "119", "code": "119", "name": "CRISPY CHICKEN BALL", "description": "Deep fried minced chicken mixed with herbs and veggies", "price": 725, "currency": "BDT", "tags": ["V"], "spice_level": 1, "prep_time": 15, "popular": true },
              { "id": "120", "code": "120", "name": "FRIED PRAWN BALL", "description": "Savory style minced prawn prepared with crust onion & green chili", "price": 865, "currency": "BDT", "tags": ["S"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "121", "code": "121", "name": "FRIED FISH FINGER", "description": "Crumb coated finger cut fish mixed with herbs & spices", "price": 865, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 20, "popular": true },
              { "id": "122", "code": "122", "name": "WALDROF SALAD", "description": "Fresh fruits, vegetables, Grilled chicken cube cut served with Honey Mustard sauce", "price": 760, "currency": "BDT", "tags": ["D", "V", "H", "new"], "spice_level": 0, "prep_time": 15, "popular": false }
            ]
          },
          {
            "id": "grilled",
            "name": "Grilled Dish",
            "items": [
              { "id": "139", "code": "139", "name": "THAI GRILLED CHICKEN", "description": "Spicy farm chicken grilled with chef special sauce", "price": 865, "currency": "BDT", "tags": ["D", "H"], "spice_level": 2, "prep_time": 30, "popular": true },
              { "id": "140", "code": "140", "name": "THAI GRILLED BEEF", "description": "Boneless spiced beef grilled with spicy sauce", "price": 825, "currency": "BDT", "tags": ["D", "H"], "spice_level": 2, "prep_time": 30, "popular": false },
              { "id": "141", "code": "141", "name": "THAI GRILLED KING PRAWN", "description": "King prawn grilled with spicy hot & sour sauce", "price": 1185, "currency": "BDT", "unit": "per 200g", "tags": ["D", "S", "H"], "spice_level": 3, "prep_time": 25, "popular": false },
              { "id": "142", "code": "142", "name": "THAI GRILLED RED SNAPPER", "description": "Whole sea fish grilled and flavored with spicy sauce", "price": 210, "currency": "BDT", "unit": "per 100g", "tags": ["D", "S", "H"], "spice_level": 2, "prep_time": 30, "popular": true },
              { "id": "144", "code": "144", "name": "GRILLED CHICKEN WINGS", "description": "Chicken wings grilled with chili tomato sauce and spices", "price": 570, "currency": "BDT", "tags": ["D", "H"], "spice_level": 2, "prep_time": 25, "popular": true },
              { "id": "145", "code": "145", "name": "CHAR GRILLED WHOLE POMFRET", "description": "Whole Pomfret and sautéed vegetables served with mashed potatoes", "price": 1275, "currency": "BDT", "tags": ["S", "V", "new"], "spice_level": 1, "prep_time": 35, "popular": false }
            ]
          },
          {
            "id": "main-dishes",
            "name": "Main Dish",
            "items": [
              { "id": "146", "code": "146", "name": "THAI SPECIAL CRISPY CHICKEN", "description": "Thai style spiced boned chicken fried with chef special sauce", "price": 810, "currency": "BDT", "tags": [], "spice_level": 2, "prep_time": 30, "popular": true, "best_seller": true },
              { "id": "147", "code": "147", "name": "THAI CHICKEN IN FOIL PAPER", "description": "Boned chicken cooked with garlic, onion, carrot, sweet & sour sauce", "price": 990, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "148", "code": "148", "name": "THAI CHICKEN WITH GARLIC & PEPPER", "description": "Sliced chicken prepared with white garlic & Thai pepper flavored sauce", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 2, "prep_time": 20, "popular": true },
              { "id": "149", "code": "149", "name": "THAI CHICKEN WITH MUSHROOM & GINGER", "description": "Boneless sliced chicken, mushroom, onion & capsicum prepared with flavored zesty ginger", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "150", "code": "150", "name": "THAI CHICKEN WITH GREEN CHILLI", "description": "Cube cut chicken cooked with capsicum, spring onion & green chili", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "150a", "code": "150", "name": "THAI SHRIMPS WITH BASIL LEAF", "description": "Shrimp with basil leaf, onion & green chili sauce", "price": 870, "currency": "BDT", "tags": ["S", "H"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "151", "code": "151", "name": "THAI CHICKEN WITH CASHEW NUT", "description": "Cube cut chicken cooked with capsicum, onion, pineapple, cashew nut & low fat milk", "price": 725, "currency": "BDT", "tags": ["N", "D"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "151a", "code": "151", "name": "THAI SHRIMPS RED CURRY", "description": "Shrimp cooked with Thai red curry sauce, capsicum & low fat milk", "price": 870, "currency": "BDT", "tags": ["D", "S"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "152", "code": "152", "name": "THAI CHICKEN WITH BASIL LEAF", "description": "Boneless Sliced chicken cooked with basil leaf, spring onion & ground pepper", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 2, "prep_time": 20, "popular": true },
              { "id": "152a", "code": "152", "name": "THAI BAKED SHRIMPS IN PINEAPPLE", "description": "Shrimp cooked with cashew nut, carrot, butter & tomato sauce serve in pineapple", "price": 1315, "currency": "BDT", "tags": ["N", "S", "H"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "153", "code": "153", "name": "THAI BEEF WITH GARLIC & PEPPER", "description": "Delicious dish sliced beef prepared with white garlic & pepper mixed sauce", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "153a", "code": "153", "name": "THAI CHICKEN RED CURRY", "description": "Boneless Sliced chicken cooked with creamy Thai red curry sauce & low fat milk", "price": 735, "currency": "BDT", "tags": ["D", "H"], "spice_level": 2, "prep_time": 20, "popular": true },
              { "id": "154", "code": "154", "name": "THAI BEEF WITH MUSHROOM & GINGER", "description": "Boneless sliced beef, mushroom, onion & capsicum cooked with flavored zesty ginger", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "154a", "code": "154", "name": "THAI BAKED CHICKEN IN PINEAPPLE", "description": "Cube cut chicken cooked with cashew nut, pineapple, carrot, butter & tomato sauce", "price": 1150, "currency": "BDT", "tags": ["N", "H"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "155", "code": "155", "name": "THAI BEEF WITH GREEN CHILI", "description": "Sliced beef with capsicum, onion leaves & green chili", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "155a", "code": "155", "name": "THAI KING PRAWN WITH GARLIC SAUCE", "description": "King prawn prepared with capsicum & garlic flavored chili sauce", "price": 1195, "currency": "BDT", "unit": "per 200g", "tags": ["S", "H"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "156", "code": "156", "name": "THAI BEEF WITH BASIL LEAF", "description": "Tender beef with basil leaf, onion & green chili", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "156a", "code": "156", "name": "THAI SHRIMPS WITH GARLIC & PEPPER", "description": "Shrimp with white garlic & Thai pepper flavored sauce", "price": 870, "currency": "BDT", "tags": ["S", "H"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "157", "code": "157", "name": "THAI SHRIMPS WITH MUSHROOM & GINGER", "description": "Shrimp, mushroom, onion & capsicum flavored with zesty ginger", "price": 870, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "157a", "code": "157", "name": "THAI BEEF RED CURRY", "description": "Sliced beef prepared with Thai red curry sauce & capsicum", "price": 755, "currency": "BDT", "tags": ["H"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "158", "code": "158", "name": "CRISPY SPRING CHICKEN", "description": "Crispy battered chicken mixed with herbs and spices", "price": 615, "currency": "BDT", "tags": [], "spice_level": 1, "prep_time": 25, "popular": true },
              { "id": "158a", "code": "158", "name": "THAI SHRIMPS WITH GREEN CHILI", "description": "Shrimp with capsicum, onion & green chili", "price": 870, "currency": "BDT", "tags": ["S", "H"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "159", "code": "159", "name": "CRISPY CHICKEN DRUMSTICKS", "description": "Crumb coated deep fried chicken wings prepared with authentic herbs & spices", "price": 570, "currency": "BDT", "tags": [], "spice_level": 1, "prep_time": 25, "popular": true },
              { "id": "160", "code": "160", "name": "SZE-CHUAN SPRING CHICKEN", "description": "Chicken flavored with crust onion & mixed chilies", "price": 610, "currency": "BDT", "tags": ["H"], "spice_level": 3, "prep_time": 25, "popular": false },
              { "id": "161", "code": "161", "name": "SZE-CHUAN CHICKEN CHILI (DRY)", "description": "Crispy boneless chicken prepared with hot & spicy sze-chuan sauce", "price": 725, "currency": "BDT", "tags": [], "spice_level": 4, "prep_time": 20, "popular": true },
              { "id": "162", "code": "162", "name": "SZE-CHUAN CHICKEN WITH CASHEW NUT / PEKING CHICKEN", "description": "Cube cut chicken with cashew nut, spicy chili sauce/ with capsicum, fried onion & spicy sauce", "price": 725, "currency": "BDT", "tags": ["N", "H"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "163", "code": "163", "name": "SZE-CHUAN CHICKEN (GRAVY)", "description": "Cube cut chicken with spicy Sze-Chuan hot sauce", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "164", "code": "164", "name": "CHICKEN CHILI ONION", "description": "Chicken slices cooked with green chili & onion", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "165", "code": "165", "name": "SHREDDED CHICKEN WITH MUSHROOM", "description": "Thin sliced Chicken prepared with mushroom, egg & green chili sauce", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "166", "code": "166", "name": "SWEET & SOUR CHICKEN", "description": "Cube cut chicken with capsicum, bean spout, carrot, cucumber & sweet chili sauce", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": true },
              { "id": "167", "code": "167", "name": "LEMON CHICKEN", "description": "Boneless sliced chicken cooked with saucy lemon & capsicum", "price": 725, "currency": "BDT", "tags": [], "spice_level": 0, "prep_time": 20, "popular": false },
              { "id": "168", "code": "168", "name": "MASALA CHICKEN", "description": "Boned chicken cooked with chef authentic masala curry sauce", "price": 725, "currency": "BDT", "tags": [], "spice_level": 2, "prep_time": 25, "popular": true },
              { "id": "169", "code": "169", "name": "SIZZLING CHICKEN", "description": "Sliced chicken glazed in high heat and cooked with red chili, capsicum, carrot & onion", "price": 865, "currency": "BDT", "tags": [], "spice_level": 3, "prep_time": 25, "popular": false },
              { "id": "177", "code": "177", "name": "BEEF CHILI ONION", "description": "Boneless sliced beef prepared with spring onion & green chili", "price": 760, "currency": "BDT", "tags": ["H"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "180", "code": "180", "name": "CHICKEN SCHNITZEL", "description": "Boneless sliced chicken coated with eggs, flours & bread crumb served with roasted potatoes and Thousand island sauce", "price": 610, "currency": "BDT", "tags": ["V", "H", "new"], "spice_level": 0, "prep_time": 25, "popular": false },
              { "id": "181", "code": "181", "name": "SPECIAL FRIED PRAWNS", "description": "Deep fried crumb prawn mixed with herbs and spices", "price": 855, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "182", "code": "182", "name": "SWEET & SOUR PRAWNS OR BALLS", "description": "Prawn balls with sweet chili, carrot, onion, capsicum & cucumber", "price": 855, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "183", "code": "183", "name": "SZE-CHUAN PRAWNS WITH GARLIC SAUCE", "description": "Prawn with spring onion & garlic flavored chili sauce", "price": 855, "currency": "BDT", "tags": ["S", "H"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "184", "code": "184", "name": "SZE-CHUAN PRAWNS CHILI (DRY)", "description": "Crispy prawn prepared with spicy chili sauce", "price": 855, "currency": "BDT", "tags": ["S"], "spice_level": 4, "prep_time": 20, "popular": false },
              { "id": "185", "code": "185", "name": "PRAWNS WITH GARLIC SAUCE", "description": "Prawn with spring onion & garlic flavored white sauce", "price": 815, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "186", "code": "186", "name": "SIZZLING PRAWNS", "description": "Prawn glazed in high heat and cooked with red chili, capsicum, carrot & onion", "price": 985, "currency": "BDT", "tags": ["S"], "spice_level": 3, "prep_time": 25, "popular": false },
              { "id": "187", "code": "187", "name": "PRAWNS WITH GREEN PEPPER", "description": "Prawn with capsicum, spring onion & green chili", "price": 855, "currency": "BDT", "tags": ["S"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "189", "code": "189", "name": "SZE-CHUAN BEEF CHILI (DRY)", "description": "Crispy sliced beef prepared with Sze-Chuan hot & spicy chili sauce", "price": 760, "currency": "BDT", "tags": [], "spice_level": 4, "prep_time": 20, "popular": false },
              { "id": "190", "code": "190", "name": "SZE-CHUAN BEEF WITH GINGER & PEPPER", "description": "Boneless sliced beef with capsicum, carrot, onion leaves, fried garlic & ginger flavored sauce", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "191", "code": "191", "name": "SZE-CHUAN BEEF STEAK", "description": "Beef steak prepared with spicy sauce, onion, tomato, carrot, capsicum & butter", "price": 1015, "currency": "BDT", "tags": ["H"], "spice_level": 3, "prep_time": 30, "popular": false },
              { "id": "192", "code": "192", "name": "SIZZLING BEEF", "description": "Sliced beef glazed in high heat and cooked with red chili, capsicum, carrot & onion", "price": 915, "currency": "BDT", "tags": [], "spice_level": 3, "prep_time": 25, "popular": false },
              { "id": "193", "code": "193", "name": "BEEF WITH MUSHROOM & OYSTER SAUCE", "description": "Sliced beef & mushroom cooked with oyster sauce", "price": 725, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": false }
            ]
          },
          {
            "id": "fish",
            "name": "Fish",
            "items": [
              { "id": "194", "code": "194", "name": "THAI STEAMED RED SNAPPER WITH CHILI LIME SPICES", "description": "Steamed red snapper prepared with green lime chili sauce", "price": 190, "currency": "BDT", "unit": "per 100g", "tags": ["S", "H"], "spice_level": 3, "prep_time": 30, "popular": true },
              { "id": "195", "code": "195", "name": "ASIAN STYLE STEMMED RED SNAPPER", "description": "Steamed red snpper with Asian style spices", "price": 190, "currency": "BDT", "unit": "per 100g", "tags": ["S", "H", "new"], "spice_level": 2, "prep_time": 30, "popular": false },
              { "id": "196", "code": "196", "name": "THAI FRIED WHOLE RED SNAPPER WITH HOT SAUCE", "description": "Fried red snapper cooked with capsicum, onion, carrot, onion leaves & hot chili sauce", "price": 190, "currency": "BDT", "unit": "per 100g", "tags": ["S", "H"], "spice_level": 3, "prep_time": 35, "popular": false },
              { "id": "197", "code": "197", "name": "LOBSTER THERMIDOR WITH SAUTE VEGETABLE & WEDGES", "description": "Lobster thermidor with sautéed vegetables and potato wedges", "price": 1895, "currency": "BDT", "tags": ["S", "V", "new"], "spice_level": 1, "prep_time": 40, "popular": false },
              { "id": "198", "code": "198", "name": "THAI STEAMED POMFRET WITH MUSHROOM & GINGER", "description": "Steamed pomfret with mushroom, ginger & white sauce", "price": 1360, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 30, "popular": false },
              { "id": "199", "code": "199", "name": "THAI FRIED POMFRET WITH HOT SAUCE", "description": "Whole pomfret with capsicum, carrot, onion leaves & hot chili sauce", "price": 1360, "currency": "BDT", "tags": ["S"], "spice_level": 3, "prep_time": 35, "popular": false },
              { "id": "200", "code": "200", "name": "THAI FRIED POMFRET WITH GARLIC SAUCE", "description": "Whole fried pomfret with chili & white garlic sauce", "price": 1360, "currency": "BDT", "tags": ["S", "H"], "spice_level": 2, "prep_time": 35, "popular": false },
              { "id": "201", "code": "201", "name": "THAI SPICY POMFRET", "description": "Pomfret cooked with capsicum, onion, carrot & hot chili sauce", "price": 1360, "currency": "BDT", "tags": ["S", "H"], "spice_level": 3, "prep_time": 35, "popular": false },
              { "id": "202", "code": "202", "name": "CHAR GRILLED KING FISH", "description": "King fish sautéed with vegetables served with roasted potatoes & Lemon butter sauce", "price": 1015, "currency": "BDT", "tags": ["S", "new"], "spice_level": 1, "prep_time": 35, "popular": false },
              { "id": "203", "code": "203", "name": "ASIAN FISH BASKET", "description": "Mouth-watering deep fried crispy Coral & tiger prawns served with roasted potatoes, Sautéed vegetables & tartar sauce", "price": 1715, "currency": "BDT", "tags": ["S", "H", "new"], "spice_level": 1, "prep_time": 30, "popular": false },
              { "id": "204", "code": "204", "name": "SLICED FISH WITH MUSHROOM & GINGER", "description": "Sliced sea fish prepared with capsicum, onion, mushroom, & ginger", "price": 1100, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "205", "code": "205", "name": "HOT & SOUR POMFRET", "description": "Whole pomfret cooked with capsicum, onion, carrot, & hot chili sauce", "price": 1360, "currency": "BDT", "tags": ["S", "H"], "spice_level": 3, "prep_time": 35, "popular": false },
              { "id": "206", "code": "206", "name": "FRIED FISH WITH GARLIC & OYSTER SAUCE", "description": "Battered fish cooked with garlic & oyster sauce", "price": 960, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "207", "code": "207", "name": "MANDARIN FISH WTIH GINGER", "description": "Mandarin fish with julienne green papaya, carrot, bean spout, spring onion & ginger", "price": 960, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "208", "code": "208", "name": "SLICED STEAMED FISH WITH MUSHROOM & GINGER", "description": "Steamed sea fish prepare with mushroom, ginger & white sauce", "price": 1015, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 30, "popular": false },
              { "id": "209", "code": "209", "name": "HOT & SOUR FISH", "description": "Sliced sea fish cooked with special chili sauce", "price": 970, "currency": "BDT", "tags": ["S", "H"], "spice_level": 3, "prep_time": 25, "popular": true },
              { "id": "210", "code": "210", "name": "SWEET & SOUR FISH", "description": "Sliced sea fish cooked with special hot and sour sauce", "price": 970, "currency": "BDT", "tags": ["S", "H"], "spice_level": 2, "prep_time": 25, "popular": false },
              { "id": "211", "code": "211", "name": "MEDITERRANEAN FISH PLATTER", "description": "Mixed char grilled platter of king fish, tiger prawns & pomfret served with sautéed vegetables, roasted potatoes and tartar sauce", "price": 2095, "currency": "BDT", "tags": ["S", "new"], "spice_level": 1, "prep_time": 40, "popular": false, "serves": 2 },
              { "id": "212", "code": "212", "name": "FISH AND CHIPS WITH TARTAR SAUCE", "description": "Fried fish fillet with tartar sauce & French fries", "price": 945, "currency": "BDT", "tags": ["S"], "spice_level": 0, "prep_time": 25, "popular": true }
            ]
          },
          {
            "id": "vegetable",
            "name": "Vegetable",
            "items": [
              { "id": "213", "code": "213", "name": "THAI MIXED VEGETABLE WITH CHICKEN OR PRAWN", "description": "Seasonal mixed vegetable cooked with chicken slices & prawn", "price": 675, "currency": "BDT", "tags": ["S", "V"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "214", "code": "214", "name": "THAI MIXED VEGETABLE WITH MUSHROOM AND BABY CORN", "description": "Saute mixed seasonal vegetable cooked with mushroom & baby corn", "price": 675, "currency": "BDT", "tags": ["V", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "215", "code": "215", "name": "THAI STEAMED VEGETABLE WITH MUSHROOM", "description": "Chef selected vegetable steamed with mushroom for healthy eater", "price": 645, "currency": "BDT", "tags": ["V", "H"], "spice_level": 0, "prep_time": 15, "popular": false },
              { "id": "216", "code": "216", "name": "CHICKEN WITH VEGETABLE", "description": "Garden mixed vegetable prepared with sliced chicken", "price": 600, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "217", "code": "217", "name": "PRAWN WITH VEGETABLE", "description": "Seasonal fresh vegetable prepared with prawn", "price": 645, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "218", "code": "218", "name": "BEEF WITH VEGETABLE", "description": "Beef slices with seasonal mixed vegetable", "price": 610, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "219", "code": "219", "name": "FISH WITH VEGETABLE", "description": "Seasonal fresh vegetable with sliced fish", "price": 645, "currency": "BDT", "tags": ["S", "V", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "220", "code": "220", "name": "STEAMED BROCCOLI WITH GARLIC BUTTER", "description": "Steamed broccoli with butter & garlic saute for healthy eater", "price": 615, "currency": "BDT", "tags": ["H"], "spice_level": 0, "prep_time": 15, "popular": false }
            ]
          },
          {
            "id": "rice-noodles",
            "name": "Rice & Noodles",
            "items": [
              { "id": "221", "code": "221", "name": "THAI SPECIAL FRIED RICE", "description": "Aromatic rice prepared with sliced chicken, prawn, egg, vegetable, butter oil & sauce", "price": 610, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 20, "popular": true },
              { "id": "222", "code": "222", "name": "AMERICAN FRIED RICE", "description": "Special rice & cashew nut cooked with butter, sliced chicken, raisin & spicy sauce", "price": 725, "currency": "BDT", "tags": ["N"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "223", "code": "223", "name": "THAI VEGETABLE FRIED RICE", "description": "Spiced mixed rice cooked with seasonal vegetable & butter oil", "price": 580, "currency": "BDT", "tags": ["V", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "224", "code": "224", "name": "THAI NOODLES WITH CHICKEN OR PRAWN", "description": "Saute mixed vegetable & noodles cooked with sliced chicken or prawn", "price": 685, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "225", "code": "225", "name": "CHICKEN FRIED RICE", "description": "Special rice cooked with sliced chicken, egg, vegetable & spring onion", "price": 595, "currency": "BDT", "tags": ["H", "V"], "spice_level": 1, "prep_time": 20, "popular": true },
              { "id": "226", "code": "226", "name": "PRAWN FRIED RICE", "description": "Chef selected rice & seasonal vegetable cooked with prawn, egg & spring onion", "price": 595, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "227", "code": "227", "name": "BEEF FRIED RICE", "description": "Sliced beef cooked with rice, egg & herbs mixed sauces", "price": 595, "currency": "BDT", "tags": ["H", "V"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "228", "code": "228", "name": "EGG FRIED RICE", "description": "Fried rice prepared with egg, vegetable & spring onion", "price": 595, "currency": "BDT", "tags": ["H"], "spice_level": 0, "prep_time": 20, "popular": false },
              { "id": "229", "code": "229", "name": "MASALA FRIED RICE", "description": "Aromatic rice prepared with sliced chicken, egg, vegetable & spices", "price": 595, "currency": "BDT", "tags": [], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "230", "code": "230", "name": "MIXED FRIED RICE", "description": "Aromatic rice cooked with chicken slices, prawn, vegetable, egg and spicy sauce", "price": 610, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 20, "popular": true },
              { "id": "231", "code": "231", "name": "SPECIAL FRIED RICE", "description": "Special rice prepared with butter, sliced chicken, prawn, vegetable, egg & chef authentic sauce", "price": 725, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "232", "code": "232", "name": "STEAMED RICE", "description": "Selected rice prepared in steam process", "price": 340, "currency": "BDT", "tags": [], "spice_level": 0, "prep_time": 15, "popular": false },
              { "id": "233", "code": "233", "name": "CHICKEN CHOWMEIN", "description": "Stir fried noodles with saute mixed chicken slices & vegetable", "price": 610, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": true },
              { "id": "234", "code": "234", "name": "MIXED CHOWMEIN", "description": "Stir fried noodles with saute mixed chicken slices, prawn & vegetable", "price": 640, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "235", "code": "235", "name": "SZE-CHUAN CHOWMEIN", "description": "Stir fried noodles prepared with sliced chicken, prawn & mixed vegetable", "price": 675, "currency": "BDT", "tags": ["S"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "236", "code": "236", "name": "CANTON CHOPSUEY", "description": "Crispy fried noodles topping with saucy sliced chicken & prawn", "price": 725, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "237", "code": "237", "name": "AMERICAN CHOPSUEY", "description": "Crispy fried noodles topping with sliced chicken, prawn, vegetable & egg", "price": 690, "currency": "BDT", "tags": ["S"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "238", "code": "238", "name": "CHINESE CHOPSUEY", "description": "Crispy fried noodles serve with saucy sliced chicken & Julienne cut vegetable", "price": 725, "currency": "BDT", "tags": ["V"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "239", "code": "239", "name": "SPAGHETTI ALFREDO WITH CHICKEN", "description": "Italian spaghetti prepared with dice cut chicken, broccoli ,butter & Alfredo sauce", "price": 720, "currency": "BDT", "tags": ["D"], "spice_level": 0, "prep_time": 25, "popular": false }
            ]
          },
          {
            "id": "vegetarian",
            "name": "Vegetarian",
            "items": [
              { "id": "240", "code": "240", "name": "PURE VEGETABLE SOUP", "description": "Seasonal mixed vegetable cooked with herbs", "price": 570, "currency": "BDT", "tags": ["V", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "241", "code": "241", "name": "FRIED VEGETABLE ROLL", "description": "Mixed garden vegetable wrapped with crispy dough", "price": 570, "currency": "BDT", "tags": ["V"], "spice_level": 1, "prep_time": 15, "popular": true },
              { "id": "242", "code": "242", "name": "FRIED VEGETABLE BALL", "description": "Deep fried mixed vegetable ball prepared with herbs & spices", "price": 580, "currency": "BDT", "tags": ["V"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "243", "code": "243", "name": "SWEET & SOUR VEGETABLE", "description": "Chef selected vegetable boiled with sweet & sour sauce", "price": 570, "currency": "BDT", "tags": ["V", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "244", "code": "244", "name": "STEAMED VEGETABLE", "description": "Seasonal fresh vegetable prepared in steam process (salt, sugar and oil free)", "price": 575, "currency": "BDT", "tags": ["V", "H"], "spice_level": 0, "prep_time": 15, "popular": false },
              { "id": "245", "code": "245", "name": "MIXED VEGETABLE", "description": "Seasonal mixed vegetable saute with butter & fried garlic", "price": 580, "currency": "BDT", "tags": ["V", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "246", "code": "246", "name": "VEGETABLE FRIED RICE", "description": "Fried rice with mixed vegetable", "price": 570, "currency": "BDT", "tags": ["V", "H"], "spice_level": 0, "prep_time": 20, "popular": false },
              { "id": "247", "code": "247", "name": "VEGETABLE CHOWMEIN", "description": "Stir fried noodles with saute mixed vegetable", "price": 580, "currency": "BDT", "tags": ["V", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "248", "code": "248", "name": "VEGETABLE CHOPSUEY", "description": "Crispy fried noodles serve with saucy mixed vegetable", "price": 600, "currency": "BDT", "tags": ["V", "H"], "spice_level": 1, "prep_time": 25, "popular": false }
            ]
          },
          {
            "id": "chef-special",
            "name": "Chef's Special",
            "items": [
              { "id": "249", "code": "249", "name": "THAI CHICKEN GREEN CURRY", "description": "Boneless sliced chicken cooked with capsicum, Thai green curry sauce & low fat milk", "price": 715, "currency": "BDT", "tags": ["D", "H"], "spice_level": 2, "prep_time": 25, "popular": true },
              { "id": "250", "code": "250", "name": "SPECIAL CHICKEN IN CURRY SAUCE", "description": "Cube cut Chicken cooked with chef authentic curry sauce & low fat milk", "price": 815, "currency": "BDT", "tags": ["D", "H"], "spice_level": 2, "prep_time": 25, "popular": false },
              { "id": "251", "code": "251", "name": "SPICY CRISPY CHICKEN", "description": "Crispy coated chicken with chef authentic spices", "price": 855, "currency": "BDT", "tags": [], "spice_level": 3, "prep_time": 30, "popular": true },
              { "id": "252", "code": "252", "name": "CRISPY MAGIC CHICKEN", "description": "Special crispy chicken preparation with chef's secret recipe", "price": 815, "currency": "BDT", "tags": ["H", "new"], "spice_level": 2, "prep_time": 30, "popular": false },
              { "id": "253", "code": "253", "name": "BANGKOK STYLE VEGETABLE", "description": "Mixed garden vegetable prepared with baby corn, sweet corn, mushroom & exotic sauce", "price": 815, "currency": "BDT", "tags": ["V", "H"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "254", "code": "254", "name": "SPECIAL THAI NOODLES WITH CHICKEN & PRAWN", "description": "Pad Thai noodles cooked with mixed vegetable, ground nut, sliced chicken, prawn & egg", "price": 715, "currency": "BDT", "tags": ["S", "H"], "spice_level": 2, "prep_time": 25, "popular": true }
            ]
          },
          {
            "id": "soups",
            "name": "Soup",
            "items": [
              { "id": "123", "code": "123", "name": "THAI HOT SOUP (TOM YAAM)", "description": "Sliced chicken, prawn,and mushroom cooked with low fat milk,Thai herbs & spicy sauce", "price": 780, "currency": "BDT", "tags": ["S", "D", "H"], "spice_level": 3, "prep_time": 25, "popular": true, "recommended": true, "image": "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&h=320&fit=crop" },
              { "id": "124", "code": "124", "name": "THAI MIXED VEGETABLE SOUP", "description": "Seasonal vegetable cooked with sliced chicken, prawn, mushroom & baby corn", "price": 655, "currency": "BDT", "tags": ["S", "H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "125", "code": "125", "name": "THAI NOODLES SOUP", "description": "Thai noodles and sliced chicken, cooked with bean spout & cabbage", "price": 680, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "126", "code": "126", "name": "THAI HOT POT SOUP", "description": "Sea fish,sliced chicken, prawn prepared with onion,Thai ginger & herbs mixed spicy sauce", "price": 890, "currency": "BDT", "tags": ["S", "H"], "spice_level": 3, "prep_time": 25, "popular": false },
              { "id": "127", "code": "127", "name": "SZE-CHUAN SOUP", "description": "Minced chicken, prawn and mushroom cooked with baby corn & chili tomato sauce", "price": 570, "currency": "BDT", "tags": ["S", "H"], "spice_level": 3, "prep_time": 20, "popular": true },
              { "id": "128", "code": "128", "name": "CREAM OF CHICKEN & MUSHROOM SOUP", "description": "Blended sautéed mushrooms, Cube-cut boiled chicken with fresh cream", "price": 750, "currency": "BDT", "tags": ["D", "V", "new"], "spice_level": 0, "prep_time": 20, "popular": false },
              { "id": "129", "code": "129", "name": "CHICKEN VEGETABLE SOUP", "description": "Sliced chicken prepared with seasonal mixed vegetable", "price": 595, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "130", "code": "130", "name": "CHICKEN WONTHON/NOODLES VEGETABLE SOUP", "description": "Sliced chicken & noodles prepared with saucy vegetable", "price": 720, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 20, "popular": false },
              { "id": "131", "code": "131", "name": "CHICKEN CORN SOUP", "description": "Mild taste soup cooked with minced chicken, sweet corn & egg", "price": 595, "currency": "BDT", "tags": ["H"], "spice_level": 0, "prep_time": 20, "popular": true, "image": "https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?w=400&h=320&fit=crop" },
              { "id": "132", "code": "132", "name": "SPECIAL CORN SOUP", "description": "Minced Chicken, egg, sweet corn, and mushroom mixed with butter & cashew nut", "price": 780, "currency": "BDT", "tags": ["H"], "spice_level": 0, "prep_time": 20, "popular": false },
              { "id": "133", "code": "133", "name": "THAI SOUP CLEAR OR THICK", "description": "Sliced chicken, prawn, mushroom & ginger / chili tomato puree for thick soup", "price": 595, "currency": "BDT", "tags": ["S", "H"], "spice_level": 2, "prep_time": 20, "popular": false },
              { "id": "134", "code": "134", "name": "SPECIAL THAI SOUP THICK", "description": "Sliced chicken & prawn cooked with mushroom, fried onion and chili tomato puree", "price": 815, "currency": "BDT", "tags": ["S", "H"], "spice_level": 3, "prep_time": 20, "popular": false },
              { "id": "135", "code": "135", "name": "HOT & SOUR SOUP", "description": "Minced chicken and egg cooked with hot & sour tomato sauce", "price": 575, "currency": "BDT", "tags": ["H"], "spice_level": 3, "prep_time": 20, "popular": true },
              { "id": "136", "code": "136", "name": "STEAMED CHICKEN SOUP", "description": "Coated chicken steamed with onion & ginger flavored sauce", "price": 785, "currency": "BDT", "tags": ["H"], "spice_level": 1, "prep_time": 25, "popular": false },
              { "id": "137", "code": "137", "name": "STEAMBOAT SOUP (BIG)", "description": "Boneless sliced chicken, prawn, sea fish, and egg boiled with vermeil noodles & seasonal veggies", "price": 1940, "currency": "BDT", "tags": ["S", "H"], "spice_level": 2, "prep_time": 30, "popular": false, "serves": 4 },
              { "id": "138", "code": "138", "name": "STEAMBOAT SOUP (SMALL)", "description": "Boneless sliced chicken, prawn, sea fish, and egg, boiled with vermeil noodles & seasonal veggies", "price": 1445, "currency": "BDT", "tags": ["S", "H"], "spice_level": 2, "prep_time": 30, "popular": false, "serves": 2 }
            ]
          }
        ]
      },
      {
        "id": "bangla",
        "name": "Bangla",
        "description": "Traditional Bengali cuisine",
        "icon": "🇧🇩",
        "minimum_order": 100,
        "minimum_order_unit": "persons",
        "items": [
          { "id": "bangla-01", "code": "01", "name": "Whole Mutton", "description": "Whole mutton cooked with traditional Bengali spices", "price": 12500, "currency": "BDT", "serving_size": "Whole", "serves": 15, "tags": [] },
          { "id": "bangla-02", "code": "02", "name": "Whole Fish Dopiaza", "description": "Whole fish cooked with onions and traditional spices", "price": 2700, "currency": "BDT", "serving_size": "Whole", "serves": 8, "tags": [] },
          { "id": "bangla-03", "code": "03", "name": "Whole Roast Chicken", "description": "Whole chicken roasted with traditional spices", "price": 650, "currency": "BDT", "serving_size": "Whole", "serves": 4, "tags": [] },
          { "id": "bangla-04", "code": "04", "name": "Mutton Rezala Per Person", "description": "Mutton rezala portion per person", "price": 350, "currency": "BDT", "serving_size": "Per Person", "serves": 1, "tags": [] },
          { "id": "bangla-05", "code": "05", "name": "Beef Rezala Per Person", "description": "Beef rezala portion per person", "price": 275, "currency": "BDT", "serving_size": "Per Person", "serves": 1, "tags": [] },
          { "id": "bangla-06", "code": "06", "name": "Piece of Roast Chicken", "description": "Single piece of roast chicken", "price": 150, "currency": "BDT", "serving_size": "Per Piece", "serves": 1, "tags": [] },
          { "id": "bangla-07", "code": "07", "name": "Rui Fish Fry/Dopiaza Per Piece", "description": "Rui fish either fried or dopiaza style per piece", "price": 150, "currency": "BDT", "serving_size": "Per Piece", "serves": 1, "tags": [] },
          { "id": "bangla-08", "code": "08", "name": "Mixed Fruits Salad", "description": "Fresh mixed fruits salad", "price": 125, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": ["V"] },
          { "id": "bangla-09", "code": "09", "name": "Egg Korma", "description": "Eggs cooked in rich korma gravy", "price": 60, "currency": "BDT", "serving_size": "Per Person", "serves": 1, "tags": [] },
          { "id": "bangla-10", "code": "10", "name": "Mixed Vegetable/Yellow Dal", "description": "Mixed vegetables or yellow lentil", "price": 60, "currency": "BDT", "serving_size": "Per Person", "serves": 1, "tags": ["V"] },
          { "id": "bangla-11", "code": "11", "name": "Coleslaw Salad", "description": "Fresh coleslaw salad", "price": 60, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": ["V"] },
          { "id": "bangla-12", "code": "12", "name": "Aloo Bukhara Chutney", "description": "Plum chutney", "price": 60, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": ["V"] },
          { "id": "bangla-13", "code": "13", "name": "Chotpoti/Fuska", "description": "Traditional chotpoti or fuska", "price": 60, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": [] },
          { "id": "bangla-14", "code": "14", "name": "Nan/Rumali Roti", "description": "Nan bread or rumali roti", "price": 60, "currency": "BDT", "serving_size": "Per Piece", "serves": 1, "tags": ["V"] },
          { "id": "bangla-15", "code": "15", "name": "Shahi Kheer Ice-Cream", "description": "Royal kheer flavored ice cream", "price": 135, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": ["D"] },
          { "id": "bangla-16", "code": "16", "name": "Traditional Sweet", "description": "Traditional Bengali sweet", "price": 125, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": ["D"] },
          { "id": "bangla-17", "code": "17", "name": "Cup Yogurt", "description": "Fresh yogurt cup", "price": 75, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": ["D"] },
          { "id": "bangla-18", "code": "18", "name": "Golap Jam", "description": "Rose flavored sweet", "price": 70, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": ["D"] },
          { "id": "bangla-19", "code": "19", "name": "Reshmi Jilapi", "description": "Silky jalebi", "price": 50, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": ["D"] },
          { "id": "bangla-20", "code": "20", "name": "Tea/Coffee", "description": "Hot tea or coffee", "price": 50, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": [] },
          { "id": "bangla-21", "code": "21", "name": "Mineral Water Per Person", "description": "Mineral water per person", "price": 15, "currency": "BDT", "serving_size": "Per Person", "serves": 1, "tags": [] },
          { "id": "bangla-22", "code": "22", "name": "Pan Box", "description": "Box of pan", "price": 15, "currency": "BDT", "serving_size": "Regular", "serves": 1, "tags": [] }
        ]
      },
      {
        "id": "beverages",
        "name": "Beverage & Desserts",
        "description": "Refreshing drinks and sweet treats",
        "icon": "🥤",
        "items": [
          { "id": "351", "code": "351", "name": "MIXED FRUIT MOCKTAIL", "description": "A mixed fruit mocktail with fresh Apples & Kiwi.", "price": 310, "currency": "BDT", "type": "mocktail", "cold": true, "tags": [] },
          { "id": "352", "code": "352", "name": "PASSION FRUIT MOJITO", "description": "An exotic concoction of passion fruit mint leaves & lime.", "price": 310, "currency": "BDT", "type": "mojito", "cold": true, "tags": [] },
          { "id": "353", "code": "353", "name": "BLUE CURACAO", "description": "The magical fusion of orange and lemon will bring you the freshness of the ocean.", "price": 365, "currency": "BDT", "type": "mocktail", "cold": true, "tags": [] },
          { "id": "354", "code": "354", "name": "MOJITO ORIGINAL", "description": "Iced mint squeezes with fresh lime, a classic refreshment.", "price": 275, "currency": "BDT", "type": "mojito", "cold": true, "tags": [] },
          { "id": "355", "code": "355", "name": "STRAWBERRY MARGARITA", "description": "With the icy blend of strawberry purita & lemon. It's a berry berry world !", "price": 285, "currency": "BDT", "type": "mocktail", "cold": true, "tags": [] },
          { "id": "356", "code": "356", "name": "RAINBOW ROSATA", "description": "A dreamy fusion of Mango, Kiwi, Strawberries venture into the world of exotic fruits.", "price": 395, "currency": "BDT", "type": "mocktail", "cold": true, "tags": [] },
          { "id": "357", "code": "357", "name": "MANGO SUNRISE", "description": "Mango pulp blended with ice & smoothie. A perfect snap to throw together.", "price": 310, "currency": "BDT", "type": "smoothie", "cold": true, "tags": [] },
          { "id": "358", "code": "358", "name": "GREEN SEA BREEZE", "description": "A classic combination of Green Apple, Kiwi & Lime soda.", "price": 315, "currency": "BDT", "type": "mocktail", "cold": true, "tags": [] },
          { "id": "359", "code": "359", "name": "CHOCOLATE LOVERS", "description": "The name says it all !", "price": 300, "currency": "BDT", "type": "mocktail", "cold": true, "tags": [] },
          { "id": "360", "code": "360", "name": "BLUE ICED LATTE", "description": "A blend of ocean in Iced Latte.", "price": 265, "currency": "BDT", "type": "coffee", "cold": true, "tags": ["new"] },
          { "id": "361", "code": "361", "name": "STRAWBERRY SMOOTHIE", "description": "A divine blend of vegan classic refreshment with fresh strawberries.", "price": 310, "currency": "BDT", "type": "smoothie", "cold": true, "tags": [] },
          { "id": "362", "code": "362", "name": "CHOCHOLATE OREO MILKSHAKE", "description": "The name says it all !", "price": 285, "currency": "BDT", "type": "milkshake", "cold": true, "tags": [] },
          { "id": "363", "code": "363", "name": "RAINBOW LEMONADE", "description": "Fresh lemons, Cranberry juice and butterfly pea tea mixed in our lemonade base.", "price": 285, "currency": "BDT", "type": "lemonade", "cold": true, "tags": ["new"] },
          { "id": "364", "code": "364", "name": "KIDS FLAVOUR (Chocolate or, Vanilla or, Strawberry)", "description": "Choose any flavours: Chocolate or Strawberry or Vanilla", "price": 205, "currency": "BDT", "type": "kids", "cold": true, "tags": ["new"] },
          { "id": "365", "code": "365", "name": "RED VELVET CAKE", "description": "Soft Sponge Cake filled with rich Cheese frosting.", "price": 185, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "366", "code": "366", "name": "WALNUT CHOCOLATE BROWNIE", "description": "An addition of American Walnuts to our classic Chocolate brownies.", "price": 145, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "367", "code": "367", "name": "NEW YORK'S CHEESE CAKE", "description": "Smooth cream Cheese Cake at its best !", "price": 310, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "368", "code": "368", "name": "MIXED FRUIT TART", "description": "Cream custard filled with fresh fruits for your tart cravings.", "price": 100, "currency": "BDT", "type": "dessert", "tags": ["new"] },
          { "id": "369", "code": "369", "name": "MAHALABIYA", "description": "An Arabian fusion delicacy.", "price": 135, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "371", "code": "371", "name": "ENGLISH BREAKFAST TEA", "description": "Traditional English breakfast tea", "price": 155, "currency": "BDT", "type": "tea", "cold": false, "tags": [] },
          { "id": "372", "code": "372", "name": "JASMINE GREEN TEA", "description": "Jasmine flavored green tea", "price": 155, "currency": "BDT", "type": "tea", "cold": false, "tags": [] },
          { "id": "373", "code": "373", "name": "GINGER TEA", "description": "Hot ginger tea", "price": 135, "currency": "BDT", "type": "tea", "cold": false, "tags": [] },
          { "id": "374", "code": "374", "name": "ESPRESSO", "description": "Strong espresso coffee", "price": 155, "currency": "BDT", "type": "coffee", "cold": false, "tags": [] },
          { "id": "375", "code": "375", "name": "CAPPUCCINO", "description": "Classic cappuccino", "price": 265, "currency": "BDT", "type": "coffee", "cold": false, "tags": [] },
          { "id": "376", "code": "376", "name": "CAFÉ LATTE", "description": "Smooth café latte", "price": 265, "currency": "BDT", "type": "coffee", "cold": false, "tags": [] },
          { "id": "377", "code": "377", "name": "AMERICANO", "description": "Americano coffee", "price": 205, "currency": "BDT", "type": "coffee", "cold": false, "tags": [] },
          { "id": "378", "code": "378", "name": "CAFÉ MOCHA", "description": "Chocolate flavored coffee", "price": 265, "currency": "BDT", "type": "coffee", "cold": false, "tags": [] },
          { "id": "379", "code": "379", "name": "COFFEE MACCHIATO", "description": "Espresso with a dollop of foamed milk", "price": 265, "currency": "BDT", "type": "coffee", "cold": false, "tags": [] },
          { "id": "380", "code": "380", "name": "WHITE MOCHA (HOT & ICE)", "description": "White chocolate mocha available hot or iced", "price": 235, "currency": "BDT", "type": "coffee", "cold": false, "tags": [] },
          { "id": "381", "code": "381", "name": "ITALIAN COFFEE AFFOGATO", "description": "Italian coffee affogato", "price": 265, "currency": "BDT", "type": "coffee", "cold": false, "tags": [] },
          { "id": "382", "code": "382", "name": "FLAVOUR COFFEE", "description": "Flavored coffee selection", "price": 265, "currency": "BDT", "type": "coffee", "cold": false, "tags": [] },
          { "id": "383", "code": "383", "name": "CHOCOLATE SMOOTHIE", "description": "Chocolate smoothie", "price": 310, "currency": "BDT", "type": "smoothie", "cold": true, "tags": [] },
          { "id": "384", "code": "384", "name": "MY FAIR LADY SMOOTHIE", "description": "Special fair lady smoothie", "price": 330, "currency": "BDT", "type": "smoothie", "cold": true, "tags": [] },
          { "id": "385", "code": "385", "name": "BANANA APPLE SMOOTHIE", "description": "Banana and apple smoothie", "price": 300, "currency": "BDT", "type": "smoothie", "cold": true, "tags": [] },
          { "id": "386", "code": "386", "name": "VANILLA MILK SHAKE", "description": "Vanilla flavored milkshake", "price": 245, "currency": "BDT", "type": "milkshake", "cold": true, "tags": [] },
          { "id": "387", "code": "387", "name": "STRAWBERRY MILK SHAKE", "description": "Strawberry flavored milkshake", "price": 255, "currency": "BDT", "type": "milkshake", "cold": true, "tags": [] },
          { "id": "388", "code": "388", "name": "CHOCHOLATE MILK SHAKE", "description": "Chocolate flavored milkshake", "price": 255, "currency": "BDT", "type": "milkshake", "cold": true, "tags": [] },
          { "id": "389", "code": "389", "name": "MIXED FRUIT MILKSHAKE", "description": "Mixed fruit milkshake", "price": 365, "currency": "BDT", "type": "milkshake", "cold": true, "tags": [] },
          { "id": "390", "code": "390", "name": "PANNA COTTA", "description": "Italian panna cotta dessert", "price": 155, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "391", "code": "391", "name": "TAMBURI", "description": "Tamburi dessert", "price": 155, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "392", "code": "392", "name": "CREAM CARAMEL", "description": "Cream caramel dessert", "price": 145, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "393", "code": "393", "name": "BLACK FOREST", "description": "Black forest cake", "price": 145, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "394", "code": "394", "name": "MANGO/ORANGE/PAPAYA/PINEAPPLE", "description": "Fresh juice of mango, orange, papaya or pineapple", "price": 235, "currency": "BDT", "type": "juice", "cold": true, "tags": [] },
          { "id": "395", "code": "395", "name": "ICED LATTE", "description": "Iced latte coffee", "price": 265, "currency": "BDT", "type": "coffee", "cold": true, "tags": [] },
          { "id": "396", "code": "396", "name": "ICED CAPPUCCINO", "description": "Iced cappuccino", "price": 265, "currency": "BDT", "type": "coffee", "cold": true, "tags": [] },
          { "id": "397", "code": "397", "name": "ICED AMERICANO", "description": "Iced americano coffee", "price": 265, "currency": "BDT", "type": "coffee", "cold": true, "tags": [] },
          { "id": "398", "code": "398", "name": "ICED COFFEE MOCHA", "description": "Iced coffee mocha", "price": 245, "currency": "BDT", "type": "coffee", "cold": true, "tags": [] },
          { "id": "401", "code": "401", "name": "SOFT DRINKS (PER GLASS)", "description": "Soft drinks per glass", "price": 60, "currency": "BDT", "type": "soft-drink", "cold": true, "tags": [] },
          { "id": "402", "code": "402", "name": "DIET COKE", "description": "Diet coke", "price": 70, "currency": "BDT", "type": "soft-drink", "cold": true, "tags": [] },
          { "id": "403", "code": "403", "name": "FRESH LIME SODA", "description": "Fresh lime with soda", "price": 145, "currency": "BDT", "type": "juice", "cold": true, "tags": [] },
          { "id": "404", "code": "404", "name": "FRESH LIME JUICE", "description": "Fresh lime juice", "price": 135, "currency": "BDT", "type": "juice", "cold": true, "tags": [] },
          { "id": "405", "code": "405", "name": "FRESH FRUITS JUICE SEASONAL", "description": "Seasonal fresh fruit juice", "price": 235, "currency": "BDT", "type": "juice", "cold": true, "tags": [] },
          { "id": "406", "code": "406", "name": "MIXED FRESH FRUITS SEASONAL", "description": "Seasonal mixed fresh fruits", "price": 235, "currency": "BDT", "type": "juice", "cold": true, "tags": [] },
          { "id": "407", "code": "407", "name": "SHAHI KHEER ICE CREAM", "description": "Royal kheer flavored ice cream", "price": 145, "currency": "BDT", "type": "ice-cream", "cold": true, "tags": [] },
          { "id": "408", "code": "408", "name": "ICE CREAM (CHOICE OF FLAVOUR)", "description": "Ice cream with choice of flavor", "price": 155, "currency": "BDT", "type": "ice-cream", "cold": true, "tags": [] },
          { "id": "409", "code": "409", "name": "TUTTI FRUITY", "description": "Tutti fruity dessert", "price": 235, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "410", "code": "410", "name": "TRADITIONAL SWEET", "description": "An Arabian fusion delicacy.", "price": 135, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "411", "code": "411", "name": "COFFEE OR JASMINE TEA", "description": "Coffee or jasmine tea", "price": 155, "currency": "BDT", "type": "beverage", "cold": false, "tags": [] },
          { "id": "412", "code": "412", "name": "MINERAL WATER (BIG)", "description": "Large mineral water bottle", "price": 55, "currency": "BDT", "type": "water", "cold": true, "tags": [] },
          { "id": "413", "code": "413", "name": "MINERAL WATER (SMALL)", "description": "Small mineral water bottle", "price": 30, "currency": "BDT", "type": "water", "cold": true, "tags": [] },
          { "id": "414", "code": "414", "name": "MILK SHAKE/LASSI", "description": "Milkshake or lassi", "price": 235, "currency": "BDT", "type": "milkshake", "cold": true, "tags": [] },
          { "id": "901", "code": "901", "name": "NEW YORK'S CHEESE CAKE", "description": "Smooth cream Cheese Cake at its best !", "price": 330, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "902", "code": "902", "name": "RED VELVET CAKE", "description": "Soft Sponge Cake filled with rich Cheese frosting.", "price": 220, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "903", "code": "903", "name": "WALNUT CHOCOLATE BROWNIE", "description": "An addition of American Walnuts to our classic Chocolate brownies.", "price": 220, "currency": "BDT", "type": "dessert", "tags": [] },
          { "id": "904", "code": "904", "name": "MAHALABIYA", "description": "An Arabian fusion delicacy.", "price": 135, "currency": "BDT", "type": "dessert", "tags": [] }
        ]
      }
    ],
    "tags_legend": {
      "S": "Contains Shrimp/Prawn",
      "N": "Contains Nuts",
      "H": "Halal",
      "V": "Vegetarian",
      "D": "Contains Dairy",
      "new": "New Item"
    },
    "spice_levels": {
      "0": "No", "1": "Mild", "2": "Medium", "3": "Spicy", "4": "Hot", "5": "Fire"
    }
  },
  "ordering": {
    "process": {
      "minimum_order_amount": 0,
      "delivery_available": true,
      "takeaway_available": true,
      "dine_in_available": true,
      "online_ordering_platform": "foodbitebd",
      "payment_methods": ["Cash", "Card", "Mobile Banking"],
      "order_steps": [
        "Browse menu",
        "Select items",
        "Choose delivery/takeaway/dine-in",
        "Provide contact details",
        "Confirm order",
        "Make payment"
      ]
    },
    "delivery": {
      "radius": "Within Dhaka city",
      "delivery_time": "45-60 minutes",
      "delivery_charge": "Depends on location"
    }
  }
};
