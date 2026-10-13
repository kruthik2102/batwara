export const CATEGORIES = [
  { id: 'food', label: 'Food & drink', icon: 'food', color: 'orange' },
  { id: 'groceries', label: 'Groceries', icon: 'cart', color: 'green' },
  { id: 'stay', label: 'Stay', icon: 'bed', color: 'indigo' },
  { id: 'transport', label: 'Transport', icon: 'car', color: 'blue' },
  { id: 'flights', label: 'Flights & trains', icon: 'plane', color: 'cyan' },
  { id: 'rent', label: 'Rent', icon: 'house', color: 'brown' },
  { id: 'utilities', label: 'Utilities', icon: 'bolt', color: 'yellow' },
  { id: 'fun', label: 'Entertainment', icon: 'ticket', color: 'pink' },
  { id: 'shopping', label: 'Shopping', icon: 'bag', color: 'purple' },
  { id: 'health', label: 'Health', icon: 'cross', color: 'red' },
  { id: 'gifts', label: 'Gifts', icon: 'gift', color: 'mint' },
  { id: 'general', label: 'General', icon: 'tag', color: 'gray' },
];

export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const categoryOf = (id) => CATEGORY[id] || CATEGORY.general;

export const GROUP_KINDS = [
  { id: 'trip', label: 'Trip', icon: 'suitcase', color: 'blue' },
  { id: 'home', label: 'Home', icon: 'house', color: 'orange' },
  { id: 'couple', label: 'Couple', icon: 'heart', color: 'pink' },
  { id: 'work', label: 'Work', icon: 'briefcase', color: 'teal' },
  { id: 'other', label: 'Other', icon: 'list', color: 'gray' },
];
export const KIND = Object.fromEntries(GROUP_KINDS.map((k) => [k.id, k]));
export const kindOf = (id) => KIND[id] || KIND.other;

/** Guess a category from the description, the way a person would. */
const HINTS = [
  [/\b(dinner|lunch|breakfast|brunch|cafe|café|coffee|chai|tea|pizza|biryani|restaurant|zomato|swiggy|drinks?|bar|beer|shack|snacks?|food|coconut|juice|ice ?cream)\b/i, 'food'],
  [/\b(grocer|bigbasket|blinkit|zepto|instamart|vegetables|milk|supermarket|dmart)\b/i, 'groceries'],
  [/\b(hotel|villa|airbnb|hostel|stay|resort|room|homestay|oyo)\b/i, 'stay'],
  [/\b(cab|uber|ola|rapido|taxi|auto|scooter|bike|fuel|petrol|diesel|toll|parking|metro|bus|rental)\b/i, 'transport'],
  [/\b(flight|indigo|vistara|air india|train|irctc|ticket to)\b/i, 'flights'],
  [/\b(rent|deposit|maintenance)\b/i, 'rent'],
  [/\b(electric|electricity|power|wifi|wi-fi|internet|broadband|gas|water bill|water can|bill|recharge|dth)\b/i, 'utilities'],
  [/\b(movie|cinema|pvr|concert|tickets?|party|cruise|club|game|netflix|spotify)\b/i, 'fun'],
  [/\b(shopping|amazon|flipkart|myntra|clothes|shoes|souvenir)\b/i, 'shopping'],
  [/\b(doctor|medicine|pharmacy|hospital|apollo|chemist)\b/i, 'health'],
  [/\b(gift|birthday|wedding|present)\b/i, 'gifts'],
];
export function guessCategory(desc) {
  for (const [re, id] of HINTS) if (re.test(desc || '')) return id;
  return null;
}
