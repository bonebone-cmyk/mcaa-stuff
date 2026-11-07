import { clamp, type Rng } from '../rng';
import { ATTRIBUTE_WEIGHTS, overallFromAttributes, type Position } from './positions';

const FIRST = [
  'Jaylen', 'Marcus', 'Tyler', 'Caleb', 'Devin', 'Isaiah', 'Jordan', 'Malik', 'Brandon', 'Cameron', 'Elijah', 'Josiah',
  'Trey', 'Xavier', 'Bryce', 'Colton', 'Darius', 'Ethan', 'Gavin', 'Hunter', 'Jace', 'Kade', 'Landon', 'Mason', 'Nolan',
  'Owen', 'Quinton', 'Reggie', 'Tristan', 'Zion', 'Andre', 'Bo', 'Cade', 'DeShawn', 'Emeka', 'Finn', 'Grayson', 'Holden',
  'Jalen', 'Keon', 'Lamar', 'Micah', 'Nico', 'Omari', 'Preston', 'Rashad', 'Sawyer', 'Tavion', 'Uriah', 'Vance', 'Wyatt',
  'Kingston', 'Amari', 'Brody', 'Carter', 'Dante', 'Eli', 'Frankie', 'Garrett', 'Hayden', 'Ivan', 'Jett', 'Kendrick',
  'Luke', 'Myles', 'Nate', 'Parker', 'Quincy', 'Rocco', 'Silas', 'Tate', 'Ty', 'Walker', 'Zeke', 'Aiden', 'Bennett',
  'Chase', 'Dillon', 'Easton', 'Jabari', 'Kobe', 'Marquise', 'Rhett', 'Shedeur', 'Terrence', 'Victor', 'Cyrus', 'Dorian',
  'Ezra', 'Fletcher', 'Harlan', 'Ignatius', 'Javon', 'Kellen', 'Leonidas', 'Maddox', 'Nehemiah', 'Orlando', 'Pierce',
];
const LAST = [
  'Johnson', 'Williams', 'Carter', 'Bennett', 'Hayes', 'Brooks', 'Coleman', 'Dawson', 'Ellis', 'Fowler', 'Graves',
  'Holloway', 'Ingram', 'Jennings', 'Kimbrough', 'Lockett', 'McAllister', 'Norwood', 'Oliver', 'Pennington', 'Quarles',
  'Ramsey', 'Sutton', 'Thornton', 'Underwood', 'Vaughn', 'Whitfield', 'Yarbrough', 'Abernathy', 'Blackwell', 'Crenshaw',
  'Dixon', 'Easley', 'Fairchild', 'Gaines', 'Hightower', 'Iverson', 'Jefferson', 'Kirkland', 'Langford', 'Merriweather',
  'Nash', 'Ogletree', 'Prescott', 'Redding', 'Stallworth', 'Tolliver', 'Upshaw', 'Vickers', 'Washington', 'Young',
  'Ashford', 'Barksdale', 'Calloway', 'Delacroix', 'Everett', 'Fontaine', 'Galloway', 'Harrington', 'Irving', 'Jackman',
  'Kingsley', 'Lathan', 'Montgomery', 'Nettles', 'Okafor', 'Pruitt', 'Rutherford', 'Sinclair', 'Talbert', 'Valentine',
  'Wainwright', 'Boone', 'Castillo', 'Dumont', 'Espinoza', 'Flowers', 'Greer', 'Hampton', 'Jacobs', 'Kemp', 'Lyons',
  'Mabry', 'Nunez', 'Osei', 'Pickett', 'Rhodes', 'Savage', 'Tatum', 'Vasquez', 'Wilder', 'Zimmerman', 'Adeyemi',
  'Batiste', 'Chambers', 'Dupree', 'Fitzgerald', 'Gentry', 'Hollins', 'Keller', 'Mayfield', 'Pope', 'Royal', 'Stroud',
];

export const STATES: { code: string; name: string; lat: number; lng: number; weight: number; towns: string[] }[] = [
  { code: 'TX', name: 'Texas', lat: 31.0, lng: -97.5, weight: 14, towns: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Katy', 'Allen', 'Tyler', 'Lubbock', 'Beaumont', 'Odessa'] },
  { code: 'FL', name: 'Florida', lat: 28.1, lng: -81.6, weight: 12, towns: ['Miami', 'Tampa', 'Jacksonville', 'Orlando', 'Fort Lauderdale', 'Tallahassee', 'Bradenton', 'Pensacola'] },
  { code: 'GA', name: 'Georgia', lat: 33.0, lng: -83.6, weight: 9, towns: ['Atlanta', 'Savannah', 'Macon', 'Valdosta', 'Columbus', 'Athens', 'Buford'] },
  { code: 'CA', name: 'California', lat: 35.5, lng: -119.5, weight: 9, towns: ['Los Angeles', 'San Diego', 'Fresno', 'Sacramento', 'Oakland', 'Bakersfield', 'Santa Ana', 'Mission Viejo'] },
  { code: 'AL', name: 'Alabama', lat: 32.8, lng: -86.8, weight: 5, towns: ['Birmingham', 'Mobile', 'Montgomery', 'Huntsville', 'Hoover', 'Tuscaloosa'] },
  { code: 'LA', name: 'Louisiana', lat: 30.9, lng: -92.0, weight: 5, towns: ['New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette', 'Monroe'] },
  { code: 'OH', name: 'Ohio', lat: 40.3, lng: -82.8, weight: 6, towns: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Massillon', 'Dayton'] },
  { code: 'PA', name: 'Pennsylvania', lat: 40.9, lng: -77.8, weight: 4, towns: ['Pittsburgh', 'Philadelphia', 'Harrisburg', 'Erie', 'Allentown'] },
  { code: 'NC', name: 'North Carolina', lat: 35.6, lng: -79.4, weight: 4, towns: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Wilmington'] },
  { code: 'SC', name: 'South Carolina', lat: 33.9, lng: -80.9, weight: 3, towns: ['Columbia', 'Greenville', 'Charleston', 'Spartanburg'] },
  { code: 'TN', name: 'Tennessee', lat: 35.9, lng: -86.4, weight: 3, towns: ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga'] },
  { code: 'MS', name: 'Mississippi', lat: 32.7, lng: -89.7, weight: 3, towns: ['Jackson', 'Hattiesburg', 'Tupelo', 'Gulfport'] },
  { code: 'VA', name: 'Virginia', lat: 37.5, lng: -78.8, weight: 3, towns: ['Richmond', 'Norfolk', 'Virginia Beach', 'Roanoke'] },
  { code: 'MI', name: 'Michigan', lat: 43.3, lng: -84.5, weight: 3, towns: ['Detroit', 'Grand Rapids', 'Lansing', 'Ann Arbor'] },
  { code: 'IL', name: 'Illinois', lat: 40.0, lng: -89.2, weight: 3, towns: ['Chicago', 'Peoria', 'Springfield', 'Naperville'] },
  { code: 'NJ', name: 'New Jersey', lat: 40.2, lng: -74.6, weight: 3, towns: ['Newark', 'Paterson', 'Trenton', 'Camden'] },
  { code: 'MD', name: 'Maryland', lat: 39.0, lng: -76.7, weight: 2, towns: ['Baltimore', 'Silver Spring', 'Annapolis'] },
  { code: 'AZ', name: 'Arizona', lat: 33.7, lng: -111.9, weight: 2, towns: ['Phoenix', 'Tucson', 'Chandler', 'Mesa'] },
  { code: 'OK', name: 'Oklahoma', lat: 35.6, lng: -97.5, weight: 2, towns: ['Tulsa', 'Oklahoma City', 'Norman', 'Lawton'] },
  { code: 'MO', name: 'Missouri', lat: 38.5, lng: -92.3, weight: 2, towns: ['St. Louis', 'Kansas City', 'Springfield', 'Columbia'] },
  { code: 'IN', name: 'Indiana', lat: 39.9, lng: -86.3, weight: 2, towns: ['Indianapolis', 'Fort Wayne', 'Carmel', 'Gary'] },
  { code: 'WA', name: 'Washington', lat: 47.4, lng: -121.5, weight: 2, towns: ['Seattle', 'Tacoma', 'Spokane', 'Bellevue'] },
  { code: 'UT', name: 'Utah', lat: 40.5, lng: -111.9, weight: 1, towns: ['Salt Lake City', 'Provo', 'Ogden'] },
  { code: 'NV', name: 'Nevada', lat: 36.2, lng: -115.1, weight: 1, towns: ['Las Vegas', 'Henderson', 'Reno'] },
  { code: 'AR', name: 'Arkansas', lat: 34.8, lng: -92.2, weight: 1, towns: ['Little Rock', 'Fayetteville', 'Pine Bluff'] },
  { code: 'KY', name: 'Kentucky', lat: 37.8, lng: -85.3, weight: 1, towns: ['Louisville', 'Lexington', 'Bowling Green'] },
  { code: 'CO', name: 'Colorado', lat: 39.5, lng: -105.0, weight: 1, towns: ['Denver', 'Colorado Springs', 'Aurora'] },
  { code: 'OR', name: 'Oregon', lat: 44.6, lng: -122.8, weight: 1, towns: ['Portland', 'Eugene', 'Salem'] },
  { code: 'MN', name: 'Minnesota', lat: 45.0, lng: -93.3, weight: 1, towns: ['Minneapolis', 'St. Paul', 'Eden Prairie'] },
  { code: 'WI', name: 'Wisconsin', lat: 43.8, lng: -89.4, weight: 1, towns: ['Milwaukee', 'Madison', 'Green Bay'] },
  { code: 'IA', name: 'Iowa', lat: 42.0, lng: -93.5, weight: 1, towns: ['Des Moines', 'Cedar Rapids', 'Iowa City'] },
  { code: 'KS', name: 'Kansas', lat: 38.5, lng: -98.0, weight: 1, towns: ['Wichita', 'Olathe', 'Topeka'] },
  { code: 'NE', name: 'Nebraska', lat: 41.2, lng: -96.0, weight: 1, towns: ['Omaha', 'Lincoln'] },
  { code: 'HI', name: 'Hawaii', lat: 21.3, lng: -157.8, weight: 1, towns: ['Honolulu', 'Kahuku', 'Hilo'] },
];

const SIZE: Record<Position, [number, number, number, number]> = {
  // height min/max (in), weight min/max
  QB: [72, 77, 195, 235], RB: [68, 73, 190, 230], WR: [69, 77, 170, 215], TE: [75, 79, 235, 260],
  OL: [75, 80, 290, 335], DL: [74, 79, 260, 320], LB: [72, 76, 220, 250], CB: [69, 74, 170, 200],
  S: [70, 75, 185, 215], K: [69, 75, 175, 210], P: [71, 77, 185, 220],
};

export function randomName(rng: Rng) {
  return { firstName: rng.pick(FIRST), lastName: rng.pick(LAST) };
}

export function randomHometown(rng: Rng, nearState?: string) {
  const st = nearState && rng.chance(0.55)
    ? STATES.find((s) => s.code === nearState) ?? rng.weighted(STATES, (s) => s.weight)
    : rng.weighted(STATES, (s) => s.weight);
  const town = rng.pick(st.towns);
  return {
    hometown: `${town}, ${st.code}`,
    state: st.code,
    lat: st.lat + rng.range(-1.2, 1.2),
    lng: st.lng + rng.range(-1.5, 1.5),
  };
}

export function generateAttributes(rng: Rng, position: Position, target: number): Record<string, number> {
  const attrs: Record<string, number> = {};
  for (const key of Object.keys(ATTRIBUTE_WEIGHTS[position])) {
    attrs[key] = Math.round(clamp(rng.normal(target, 5), 25, 99));
  }
  // nudge so the weighted overall lands on target
  const diff = target - overallFromAttributes(position, attrs);
  for (const key of Object.keys(attrs)) attrs[key] = Math.round(clamp(attrs[key] + diff, 25, 99));
  return attrs;
}

export function starsFromOverall(overall: number): number {
  if (overall >= 84) return 5;
  if (overall >= 76) return 4;
  if (overall >= 66) return 3;
  if (overall >= 56) return 2;
  return 1;
}

export interface GeneratedPlayer {
  firstName: string;
  lastName: string;
  position: Position;
  heightIn: number;
  weight: number;
  hometown: string;
  homeState: string;
  overall: number;
  potential: number;
  stars: number;
  attributes: Record<string, number>;
  devTrait: string;
}

/** Generates a rostered college player. `quality` ~ team talent (40-90). */
export function generatePlayer(rng: Rng, position: Position, quality: number, seasonsPlayed: number, depthIndex: number, homeState?: string): GeneratedPlayer {
  const { firstName, lastName } = randomName(rng);
  const town = randomHometown(rng, homeState);
  const [hMin, hMax, wMin, wMax] = SIZE[position];
  const experience = seasonsPlayed * 3;
  const overall = Math.round(clamp(rng.normal(quality + experience - depthIndex * 2.2 - 3, 5), 35, 97));
  const potential = Math.round(clamp(overall + rng.normal(8 - seasonsPlayed * 2.5, 5), overall, 99));
  const trait = rng.weighted(['normal', 'impact', 'star', 'elite'], (t) => ({ normal: 70, impact: 20, star: 8, elite: 2 })[t] ?? 1);
  return {
    firstName,
    lastName,
    position,
    heightIn: rng.int(hMin, hMax),
    weight: rng.int(wMin, wMax),
    hometown: town.hometown,
    homeState: town.state,
    overall,
    potential,
    stars: starsFromOverall(Math.round(overall - experience * 0.8 + 4)),
    attributes: generateAttributes(rng, position, overall),
    devTrait: trait,
  };
}

/** Pick a plausible unique jersey number for a position */
export function jerseyFor(rng: Rng, position: Position, used: Set<number>): number {
  const ranges: Record<Position, [number, number][]> = {
    QB: [[1, 19]], RB: [[1, 49]], WR: [[1, 19], [80, 89]], TE: [[80, 89], [40, 49]], OL: [[50, 79]],
    DL: [[90, 99], [50, 59]], LB: [[1, 59]], CB: [[1, 39]], S: [[1, 49]], K: [[10, 49]], P: [[10, 49]],
  };
  for (let i = 0; i < 40; i++) {
    const [lo, hi] = rng.pick(ranges[position]);
    const n = rng.int(lo, hi);
    if (!used.has(n)) { used.add(n); return n; }
  }
  for (let n = 0; n < 100; n++) if (!used.has(n)) { used.add(n); return n; }
  return rng.int(0, 99);
}
