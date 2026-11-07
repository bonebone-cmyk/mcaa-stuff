/**
 * Initial dataset: 138 programs in the universe's starting conference alignment.
 * Logos are the schools' real logos served from ESPN's public logo CDN (by ESPN
 * team id). Commissioners can replace any logo with an upload, rename schools,
 * add fictional programs and re-align conferences from the Commissioner Panel.
 */
export interface ConferenceSeed {
  slug: string;
  name: string;
  shortName: string;
  conferenceGames: number;
  espnId: number | null;
}

export const CONFERENCES: ConferenceSeed[] = [
  { slug: 'sec', name: 'Southeastern Conference', shortName: 'SEC', conferenceGames: 9, espnId: 8 },
  { slug: 'big-ten', name: 'Big Ten Conference', shortName: 'Big Ten', conferenceGames: 9, espnId: 5 },
  { slug: 'big-12', name: 'Big 12 Conference', shortName: 'Big 12', conferenceGames: 9, espnId: 4 },
  { slug: 'acc', name: 'Atlantic Coast Conference', shortName: 'ACC', conferenceGames: 8, espnId: 1 },
  { slug: 'american', name: 'American Conference', shortName: 'American', conferenceGames: 8, espnId: 151 },
  { slug: 'sun-belt', name: 'Sun Belt Conference', shortName: 'Sun Belt', conferenceGames: 8, espnId: 37 },
  { slug: 'mac', name: 'Mid-American Conference', shortName: 'MAC', conferenceGames: 8, espnId: 15 },
  { slug: 'mountain-west', name: 'Mountain West Conference', shortName: 'Mountain West', conferenceGames: 8, espnId: 17 },
  { slug: 'cusa', name: 'Conference USA', shortName: 'C-USA', conferenceGames: 8, espnId: 12 },
  { slug: 'pac-12', name: 'Pac-12 Conference', shortName: 'Pac-12', conferenceGames: 7, espnId: 9 },
  { slug: 'independent', name: 'FBS Independents', shortName: 'Independent', conferenceGames: 0, espnId: 18 },
];

export const conferenceLogo = (espnId: number | null) =>
  espnId ? `https://a.espncdn.com/i/teamlogos/ncaa_conf/500/${espnId}.png` : null;
export const teamLogo = (espnId: number | null) =>
  espnId ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${espnId}.png` : null;

export interface TeamSeed {
  slug: string;
  school: string;
  mascot: string;
  abbreviation: string;
  espnId: number;
  primaryColor: string;
  secondaryColor: string;
  conference: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  stadium: string;
  capacity: number;
  prestige: number;
  offenseScheme?: string;
  defenseScheme?: string;
}

type Row = [string, string, string, string, number, string, string, string, string, string, number, number, string, number, number, string?, string?];

const ROWS: Row[] = [
  // ---------------------------------------------------------------- SEC
  ['alabama', 'Alabama', 'Crimson Tide', 'ALA', 333, '#9E1B32', '#828A8F', 'sec', 'Tuscaloosa', 'AL', 33.208, -87.550, 'Bryant-Denny Stadium', 100077, 96, 'pro_style', '3-4'],
  ['arkansas', 'Arkansas', 'Razorbacks', 'ARK', 8, '#9D2235', '#FFFFFF', 'sec', 'Fayetteville', 'AR', 36.068, -94.179, 'Donald W. Reynolds Razorback Stadium', 76212, 70],
  ['auburn', 'Auburn', 'Tigers', 'AUB', 2, '#0C2340', '#E87722', 'sec', 'Auburn', 'AL', 32.603, -85.489, 'Jordan-Hare Stadium', 88043, 80, 'power_run'],
  ['florida', 'Florida', 'Gators', 'FLA', 57, '#0021A5', '#FA4616', 'sec', 'Gainesville', 'FL', 29.650, -82.349, 'Ben Hill Griffin Stadium', 88548, 82],
  ['georgia', 'Georgia', 'Bulldogs', 'UGA', 61, '#BA0C2F', '#000000', 'sec', 'Athens', 'GA', 33.950, -83.373, 'Sanford Stadium', 93033, 95, 'pro_style', '3-4'],
  ['kentucky', 'Kentucky', 'Wildcats', 'UK', 96, '#0033A0', '#FFFFFF', 'sec', 'Lexington', 'KY', 38.022, -84.505, 'Kroger Field', 61000, 64, 'pro_style', '3-4'],
  ['lsu', 'LSU', 'Tigers', 'LSU', 99, '#461D7C', '#FDD023', 'sec', 'Baton Rouge', 'LA', 30.412, -91.184, 'Tiger Stadium', 102321, 88],
  ['mississippi-state', 'Mississippi State', 'Bulldogs', 'MSST', 344, '#660000', '#FFFFFF', 'sec', 'Starkville', 'MS', 33.456, -88.794, 'Davis Wade Stadium', 60311, 62, 'air_raid'],
  ['missouri', 'Missouri', 'Tigers', 'MIZ', 142, '#F1B82D', '#000000', 'sec', 'Columbia', 'MO', 38.936, -92.333, 'Faurot Field', 57321, 72],
  ['oklahoma', 'Oklahoma', 'Sooners', 'OU', 201, '#841617', '#FDF9D8', 'sec', 'Norman', 'OK', 35.206, -97.442, 'Gaylord Family Oklahoma Memorial Stadium', 80126, 86, 'air_raid', '4-2-5'],
  ['ole-miss', 'Ole Miss', 'Rebels', 'MISS', 145, '#CE1126', '#14213D', 'sec', 'Oxford', 'MS', 34.362, -89.534, 'Vaught-Hemingway Stadium', 64038, 82, 'rpo', '4-2-5'],
  ['south-carolina', 'South Carolina', 'Gamecocks', 'SC', 2579, '#73000A', '#000000', 'sec', 'Columbia', 'SC', 33.973, -81.019, 'Williams-Brice Stadium', 77559, 70],
  ['tennessee', 'Tennessee', 'Volunteers', 'TENN', 2633, '#FF8200', '#FFFFFF', 'sec', 'Knoxville', 'TN', 35.955, -83.925, 'Neyland Stadium', 101915, 85, 'spread'],
  ['texas', 'Texas', 'Longhorns', 'TEX', 251, '#BF5700', '#FFFFFF', 'sec', 'Austin', 'TX', 30.284, -97.733, 'Darrell K Royal-Texas Memorial Stadium', 100119, 93],
  ['texas-am', 'Texas A&M', 'Aggies', 'TAMU', 245, '#500000', '#FFFFFF', 'sec', 'College Station', 'TX', 30.610, -96.340, 'Kyle Field', 102733, 86],
  ['vanderbilt', 'Vanderbilt', 'Commodores', 'VAN', 238, '#866D4B', '#000000', 'sec', 'Nashville', 'TN', 36.144, -86.809, 'FirstBank Stadium', 40350, 62],
  // ---------------------------------------------------------------- Big Ten
  ['illinois', 'Illinois', 'Fighting Illini', 'ILL', 356, '#E84A27', '#13294B', 'big-ten', 'Champaign', 'IL', 40.099, -88.236, 'Memorial Stadium', 60670, 68],
  ['indiana', 'Indiana', 'Hoosiers', 'IU', 84, '#990000', '#EEEDEB', 'big-ten', 'Bloomington', 'IN', 39.181, -86.526, 'Memorial Stadium', 52626, 84, 'spread', '4-2-5'],
  ['iowa', 'Iowa', 'Hawkeyes', 'IOWA', 2294, '#FFCD00', '#000000', 'big-ten', 'Iowa City', 'IA', 41.659, -91.551, 'Kinnick Stadium', 69250, 74, 'pro_style', '4-3'],
  ['maryland', 'Maryland', 'Terrapins', 'MD', 120, '#E03A3E', '#FFD520', 'big-ten', 'College Park', 'MD', 38.990, -76.947, 'SECU Stadium', 51802, 60],
  ['michigan', 'Michigan', 'Wolverines', 'MICH', 130, '#00274C', '#FFCB05', 'big-ten', 'Ann Arbor', 'MI', 42.266, -83.749, 'Michigan Stadium', 107601, 90, 'power_run', '3-4'],
  ['michigan-state', 'Michigan State', 'Spartans', 'MSU', 127, '#18453B', '#FFFFFF', 'big-ten', 'East Lansing', 'MI', 42.728, -84.485, 'Spartan Stadium', 75005, 64],
  ['minnesota', 'Minnesota', 'Golden Gophers', 'MINN', 135, '#7A0019', '#FFCC33', 'big-ten', 'Minneapolis', 'MN', 44.976, -93.225, 'Huntington Bank Stadium', 50805, 64, 'power_run'],
  ['nebraska', 'Nebraska', 'Cornhuskers', 'NEB', 158, '#E41C38', '#FFFFFF', 'big-ten', 'Lincoln', 'NE', 40.821, -96.706, 'Memorial Stadium', 85458, 70],
  ['northwestern', 'Northwestern', 'Wildcats', 'NU', 77, '#4E2A84', '#FFFFFF', 'big-ten', 'Evanston', 'IL', 42.065, -87.692, 'Ryan Field', 35000, 56],
  ['ohio-state', 'Ohio State', 'Buckeyes', 'OSU', 194, '#BB0000', '#666666', 'big-ten', 'Columbus', 'OH', 40.002, -83.020, 'Ohio Stadium', 102780, 96, 'spread', '4-2-5'],
  ['oregon', 'Oregon', 'Ducks', 'ORE', 2483, '#154733', '#FEE123', 'big-ten', 'Eugene', 'OR', 44.058, -123.068, 'Autzen Stadium', 54000, 91, 'spread'],
  ['penn-state', 'Penn State', 'Nittany Lions', 'PSU', 213, '#041E42', '#FFFFFF', 'big-ten', 'University Park', 'PA', 40.812, -77.856, 'Beaver Stadium', 106572, 86],
  ['purdue', 'Purdue', 'Boilermakers', 'PUR', 2509, '#CEB888', '#000000', 'big-ten', 'West Lafayette', 'IN', 40.435, -86.918, 'Ross-Ade Stadium', 57236, 54],
  ['rutgers', 'Rutgers', 'Scarlet Knights', 'RUTG', 164, '#CC0033', '#5F6A72', 'big-ten', 'Piscataway', 'NJ', 40.514, -74.465, 'SHI Stadium', 52454, 56],
  ['ucla', 'UCLA', 'Bruins', 'UCLA', 26, '#2D68C4', '#F2A900', 'big-ten', 'Pasadena', 'CA', 34.161, -118.168, 'Rose Bowl', 88565, 64],
  ['usc', 'USC', 'Trojans', 'USC', 30, '#990000', '#FFC72C', 'big-ten', 'Los Angeles', 'CA', 34.014, -118.288, 'Los Angeles Memorial Coliseum', 77500, 84, 'air_raid'],
  ['washington', 'Washington', 'Huskies', 'UW', 264, '#4B2E83', '#B7A57A', 'big-ten', 'Seattle', 'WA', 47.650, -122.302, 'Husky Stadium', 70083, 78, 'west_coast'],
  ['wisconsin', 'Wisconsin', 'Badgers', 'WIS', 275, '#C5050C', '#FFFFFF', 'big-ten', 'Madison', 'WI', 43.070, -89.413, 'Camp Randall Stadium', 76057, 70, 'power_run', '3-4'],
  // ---------------------------------------------------------------- Big 12
  ['arizona', 'Arizona', 'Wildcats', 'ARIZ', 12, '#CC0033', '#003366', 'big-12', 'Tucson', 'AZ', 32.229, -110.949, 'Arizona Stadium', 50782, 62],
  ['arizona-state', 'Arizona State', 'Sun Devils', 'ASU', 9, '#8C1D40', '#FFC627', 'big-12', 'Tempe', 'AZ', 33.426, -111.933, 'Mountain America Stadium', 53599, 74],
  ['baylor', 'Baylor', 'Bears', 'BAY', 239, '#154734', '#FFB81C', 'big-12', 'Waco', 'TX', 31.558, -97.116, 'McLane Stadium', 45140, 68],
  ['byu', 'BYU', 'Cougars', 'BYU', 252, '#002E5D', '#FFFFFF', 'big-12', 'Provo', 'UT', 40.258, -111.655, 'LaVell Edwards Stadium', 62073, 74, 'pro_style'],
  ['cincinnati', 'Cincinnati', 'Bearcats', 'CIN', 2132, '#E00122', '#000000', 'big-12', 'Cincinnati', 'OH', 39.131, -84.516, 'Nippert Stadium', 38088, 62],
  ['colorado', 'Colorado', 'Buffaloes', 'COLO', 38, '#CFB87C', '#000000', 'big-12', 'Boulder', 'CO', 40.009, -105.267, 'Folsom Field', 50183, 68, 'air_raid'],
  ['houston', 'Houston', 'Cougars', 'HOU', 248, '#C8102E', '#FFFFFF', 'big-12', 'Houston', 'TX', 29.722, -95.349, 'TDECU Stadium', 40000, 62],
  ['iowa-state', 'Iowa State', 'Cyclones', 'ISU', 66, '#C8102E', '#F1BE48', 'big-12', 'Ames', 'IA', 42.014, -93.636, 'Jack Trice Stadium', 61500, 70, 'pro_style', '3-3-5'],
  ['kansas', 'Kansas', 'Jayhawks', 'KU', 2305, '#0051BA', '#E8000D', 'big-12', 'Lawrence', 'KS', 38.963, -95.246, 'David Booth Kansas Memorial Stadium', 47000, 60, 'rpo'],
  ['kansas-state', 'Kansas State', 'Wildcats', 'KSU', 2306, '#512888', '#FFFFFF', 'big-12', 'Manhattan', 'KS', 39.202, -96.594, 'Bill Snyder Family Stadium', 50000, 72, 'rpo', '4-2-5'],
  ['oklahoma-state', 'Oklahoma State', 'Cowboys', 'OKST', 197, '#FF7300', '#000000', 'big-12', 'Stillwater', 'OK', 36.126, -97.066, 'Boone Pickens Stadium', 53855, 64, 'air_raid'],
  ['tcu', 'TCU', 'Horned Frogs', 'TCU', 2628, '#4D1979', '#A3A9AC', 'big-12', 'Fort Worth', 'TX', 32.710, -97.368, 'Amon G. Carter Stadium', 45000, 70, 'spread', '3-3-5'],
  ['texas-tech', 'Texas Tech', 'Red Raiders', 'TTU', 2641, '#CC0000', '#000000', 'big-12', 'Lubbock', 'TX', 33.591, -101.873, 'Jones AT&T Stadium', 60454, 78, 'air_raid', '4-2-5'],
  ['ucf', 'UCF', 'Knights', 'UCF', 2116, '#000000', '#B7A369', 'big-12', 'Orlando', 'FL', 28.608, -81.193, 'FBC Mortgage Stadium', 45301, 64],
  ['utah', 'Utah', 'Utes', 'UTAH', 254, '#CC0000', '#FFFFFF', 'big-12', 'Salt Lake City', 'UT', 40.760, -111.849, 'Rice-Eccles Stadium', 51444, 74, 'power_run', '4-3'],
  ['west-virginia', 'West Virginia', 'Mountaineers', 'WVU', 277, '#002855', '#EAAA00', 'big-12', 'Morgantown', 'WV', 39.650, -79.955, 'Milan Puskar Stadium', 60000, 64, 'rpo', '3-3-5'],
  // ---------------------------------------------------------------- ACC
  ['boston-college', 'Boston College', 'Eagles', 'BC', 103, '#8A100B', '#BC9B6A', 'acc', 'Chestnut Hill', 'MA', 42.335, -71.166, 'Alumni Stadium', 44500, 58],
  ['california', 'California', 'Golden Bears', 'CAL', 25, '#003262', '#FDB515', 'acc', 'Berkeley', 'CA', 37.871, -122.251, 'California Memorial Stadium', 62467, 58],
  ['clemson', 'Clemson', 'Tigers', 'CLEM', 228, '#F56600', '#522D80', 'acc', 'Clemson', 'SC', 34.679, -82.843, 'Memorial Stadium', 81500, 87],
  ['duke', 'Duke', 'Blue Devils', 'DUKE', 150, '#003087', '#FFFFFF', 'acc', 'Durham', 'NC', 35.995, -78.942, 'Wallace Wade Stadium', 40004, 64],
  ['florida-state', 'Florida State', 'Seminoles', 'FSU', 52, '#782F40', '#CEB888', 'acc', 'Tallahassee', 'FL', 30.438, -84.304, 'Doak Campbell Stadium', 67277, 80],
  ['georgia-tech', 'Georgia Tech', 'Yellow Jackets', 'GT', 59, '#B3A369', '#003057', 'acc', 'Atlanta', 'GA', 33.773, -84.393, 'Bobby Dodd Stadium', 51913, 70],
  ['louisville', 'Louisville', 'Cardinals', 'LOU', 97, '#AD0000', '#000000', 'acc', 'Louisville', 'KY', 38.206, -85.759, 'L&N Federal Credit Union Stadium', 60800, 70],
  ['miami-fl', 'Miami (FL)', 'Hurricanes', 'MIA', 2390, '#F47321', '#005030', 'acc', 'Miami Gardens', 'FL', 25.958, -80.239, 'Hard Rock Stadium', 64767, 86],
  ['nc-state', 'NC State', 'Wolfpack', 'NCST', 152, '#CC0000', '#000000', 'acc', 'Raleigh', 'NC', 35.801, -78.720, 'Carter-Finley Stadium', 56919, 64, 'spread', '3-3-5'],
  ['north-carolina', 'North Carolina', 'Tar Heels', 'UNC', 153, '#7BAFD4', '#13294B', 'acc', 'Chapel Hill', 'NC', 35.907, -79.048, 'Kenan Stadium', 50500, 68, 'pro_style', '3-4'],
  ['pittsburgh', 'Pittsburgh', 'Panthers', 'PITT', 221, '#003594', '#FFB81C', 'acc', 'Pittsburgh', 'PA', 40.447, -80.016, 'Acrisure Stadium', 68400, 64],
  ['smu', 'SMU', 'Mustangs', 'SMU', 2567, '#0033A0', '#C8102E', 'acc', 'Dallas', 'TX', 32.838, -96.783, 'Gerald J. Ford Stadium', 32000, 72, 'air_raid'],
  ['stanford', 'Stanford', 'Cardinal', 'STAN', 24, '#8C1515', '#FFFFFF', 'acc', 'Stanford', 'CA', 37.434, -122.161, 'Stanford Stadium', 50424, 58, 'pro_style'],
  ['syracuse', 'Syracuse', 'Orange', 'SYR', 183, '#F76900', '#000E54', 'acc', 'Syracuse', 'NY', 43.036, -76.136, 'JMA Wireless Dome', 49250, 60, 'air_raid'],
  ['virginia', 'Virginia', 'Cavaliers', 'UVA', 258, '#232D4B', '#F84C1E', 'acc', 'Charlottesville', 'VA', 38.031, -78.514, 'Scott Stadium', 61500, 60],
  ['virginia-tech', 'Virginia Tech', 'Hokies', 'VT', 259, '#630031', '#CF4420', 'acc', 'Blacksburg', 'VA', 37.220, -80.418, 'Lane Stadium', 65632, 66],
  ['wake-forest', 'Wake Forest', 'Demon Deacons', 'WAKE', 154, '#9E7E38', '#000000', 'acc', 'Winston-Salem', 'NC', 36.131, -80.255, 'Allegacy Federal Credit Union Stadium', 31500, 56, 'rpo'],
  // ---------------------------------------------------------------- American
  ['army', 'Army', 'Black Knights', 'ARMY', 349, '#D3BC8D', '#000000', 'american', 'West Point', 'NY', 41.387, -73.964, 'Michie Stadium', 38000, 58, 'option', '3-4'],
  ['charlotte', 'Charlotte', '49ers', 'CLT', 2429, '#046A38', '#B9975B', 'american', 'Charlotte', 'NC', 35.309, -80.740, 'Jerry Richardson Stadium', 15314, 38],
  ['east-carolina', 'East Carolina', 'Pirates', 'ECU', 151, '#592A8A', '#FDC82F', 'american', 'Greenville', 'NC', 35.597, -77.365, 'Dowdy-Ficklen Stadium', 50000, 50],
  ['florida-atlantic', 'Florida Atlantic', 'Owls', 'FAU', 2226, '#003366', '#CC0000', 'american', 'Boca Raton', 'FL', 26.376, -80.101, 'FAU Stadium', 29419, 44],
  ['memphis', 'Memphis', 'Tigers', 'MEM', 235, '#003087', '#898D8D', 'american', 'Memphis', 'TN', 35.121, -89.977, 'Simmons Bank Liberty Stadium', 58325, 58],
  ['navy', 'Navy', 'Midshipmen', 'NAVY', 2426, '#00205B', '#C5B783', 'american', 'Annapolis', 'MD', 38.985, -76.508, 'Navy-Marine Corps Memorial Stadium', 34000, 58, 'option', '4-2-5'],
  ['north-texas', 'North Texas', 'Mean Green', 'UNT', 249, '#00853E', '#FFFFFF', 'american', 'Denton', 'TX', 33.204, -97.159, 'DATCU Stadium', 30850, 52, 'air_raid'],
  ['rice', 'Rice', 'Owls', 'RICE', 242, '#00205B', '#C1C6C8', 'american', 'Houston', 'TX', 29.716, -95.409, 'Rice Stadium', 47000, 40],
  ['south-florida', 'South Florida', 'Bulls', 'USF', 58, '#006747', '#CFC493', 'american', 'Tampa', 'FL', 27.976, -82.503, 'Raymond James Stadium', 65618, 56],
  ['temple', 'Temple', 'Owls', 'TEM', 218, '#9D2235', '#FFFFFF', 'american', 'Philadelphia', 'PA', 39.901, -75.168, 'Lincoln Financial Field', 69176, 42],
  ['tulane', 'Tulane', 'Green Wave', 'TULN', 2655, '#006747', '#418FDE', 'american', 'New Orleans', 'LA', 29.944, -90.117, 'Yulman Stadium', 30000, 62],
  ['tulsa', 'Tulsa', 'Golden Hurricane', 'TLSA', 202, '#002D72', '#C8102E', 'american', 'Tulsa', 'OK', 36.149, -95.944, 'Skelly Field at H.A. Chapman Stadium', 30000, 40],
  ['uab', 'UAB', 'Blazers', 'UAB', 5, '#1E6B52', '#F4C300', 'american', 'Birmingham', 'AL', 33.513, -86.810, 'Protective Stadium', 47100, 42],
  ['utsa', 'UTSA', 'Roadrunners', 'UTSA', 2636, '#0C2340', '#F15A22', 'american', 'San Antonio', 'TX', 29.427, -98.486, 'Alamodome', 64000, 52],
  // ---------------------------------------------------------------- Sun Belt
  ['appalachian-state', 'Appalachian State', 'Mountaineers', 'APP', 2026, '#222222', '#FFCC00', 'sun-belt', 'Boone', 'NC', 36.212, -81.686, 'Kidd Brewer Stadium', 30000, 52],
  ['arkansas-state', 'Arkansas State', 'Red Wolves', 'ARST', 2032, '#CC092F', '#000000', 'sun-belt', 'Jonesboro', 'AR', 35.849, -90.669, 'Centennial Bank Stadium', 30406, 42],
  ['coastal-carolina', 'Coastal Carolina', 'Chanticleers', 'CCU', 324, '#006F71', '#A27752', 'sun-belt', 'Conway', 'SC', 33.795, -79.016, 'Brooks Stadium', 21000, 46],
  ['georgia-southern', 'Georgia Southern', 'Eagles', 'GASO', 290, '#041E42', '#A3AAAE', 'sun-belt', 'Statesboro', 'GA', 32.410, -81.782, 'Paulson Stadium', 25000, 46],
  ['georgia-state', 'Georgia State', 'Panthers', 'GAST', 2247, '#0039A6', '#C60C30', 'sun-belt', 'Atlanta', 'GA', 33.735, -84.389, 'Center Parc Stadium', 24333, 36],
  ['james-madison', 'James Madison', 'Dukes', 'JMU', 256, '#450084', '#CBB677', 'sun-belt', 'Harrisonburg', 'VA', 38.435, -78.873, 'Bridgeforth Stadium', 25000, 62],
  ['louisiana', 'Louisiana', "Ragin' Cajuns", 'UL', 309, '#CE181E', '#FFFFFF', 'sun-belt', 'Lafayette', 'LA', 30.214, -92.041, 'Cajun Field', 41426, 48],
  ['louisiana-tech', 'Louisiana Tech', 'Bulldogs', 'LT', 2348, '#002F8B', '#E31B23', 'sun-belt', 'Ruston', 'LA', 32.531, -92.650, 'Joe Aillet Stadium', 28562, 42],
  ['marshall', 'Marshall', 'Thundering Herd', 'MRSH', 276, '#00B140', '#FFFFFF', 'sun-belt', 'Huntington', 'WV', 38.424, -82.421, 'Joan C. Edwards Stadium', 38227, 48],
  ['old-dominion', 'Old Dominion', 'Monarchs', 'ODU', 295, '#003057', '#7C878E', 'sun-belt', 'Norfolk', 'VA', 36.886, -76.306, 'S.B. Ballard Stadium', 21944, 44],
  ['south-alabama', 'South Alabama', 'Jaguars', 'USA', 6, '#00205B', '#BF0D3E', 'sun-belt', 'Mobile', 'AL', 30.696, -88.178, 'Hancock Whitney Stadium', 25450, 44],
  ['southern-miss', 'Southern Miss', 'Golden Eagles', 'USM', 2572, '#000000', '#FFAB00', 'sun-belt', 'Hattiesburg', 'MS', 31.329, -89.332, 'M.M. Roberts Stadium', 36000, 42],
  ['troy', 'Troy', 'Trojans', 'TROY', 2653, '#8A2432', '#B4B7BA', 'sun-belt', 'Troy', 'AL', 31.801, -85.955, 'Veterans Memorial Stadium', 30402, 46],
  ['ul-monroe', 'UL Monroe', 'Warhawks', 'ULM', 2433, '#840029', '#BA8D3E', 'sun-belt', 'Monroe', 'LA', 32.528, -92.075, 'Malone Stadium', 30427, 34],
  // ---------------------------------------------------------------- MAC
  ['akron', 'Akron', 'Zips', 'AKR', 2006, '#041E42', '#A89968', 'mac', 'Akron', 'OH', 41.073, -81.508, 'InfoCision Stadium', 27881, 30],
  ['ball-state', 'Ball State', 'Cardinals', 'BALL', 2050, '#BA0C2F', '#FFFFFF', 'mac', 'Muncie', 'IN', 40.215, -85.412, 'Scheumann Stadium', 22500, 34],
  ['bowling-green', 'Bowling Green', 'Falcons', 'BGSU', 189, '#FE5000', '#4F2C1D', 'mac', 'Bowling Green', 'OH', 41.378, -83.623, 'Doyt L. Perry Stadium', 24000, 38],
  ['buffalo', 'Buffalo', 'Bulls', 'BUFF', 2084, '#005BBB', '#FFFFFF', 'mac', 'Buffalo', 'NY', 43.000, -78.778, 'UB Stadium', 25013, 36],
  ['central-michigan', 'Central Michigan', 'Chippewas', 'CMU', 2117, '#6A0032', '#FFC82E', 'mac', 'Mount Pleasant', 'MI', 43.578, -84.771, 'Kelly/Shorts Stadium', 30255, 36],
  ['eastern-michigan', 'Eastern Michigan', 'Eagles', 'EMU', 2199, '#006633', '#FFFFFF', 'mac', 'Ypsilanti', 'MI', 42.250, -83.623, 'Rynearson Stadium', 30200, 34],
  ['kent-state', 'Kent State', 'Golden Flashes', 'KENT', 2309, '#002664', '#EAAB00', 'mac', 'Kent', 'OH', 41.150, -81.341, 'Dix Stadium', 25319, 26],
  ['miami-oh', 'Miami (OH)', 'RedHawks', 'M-OH', 193, '#C3142D', '#FFFFFF', 'mac', 'Oxford', 'OH', 39.513, -84.734, 'Yager Stadium', 24286, 42],
  ['ohio', 'Ohio', 'Bobcats', 'OHIO', 195, '#00694E', '#FFFFFF', 'mac', 'Athens', 'OH', 39.321, -82.104, 'Peden Stadium', 24000, 42],
  ['sacramento-state', 'Sacramento State', 'Hornets', 'SAC', 16, '#043927', '#C4B581', 'mac', 'Sacramento', 'CA', 38.561, -121.424, 'Hornet Stadium', 21195, 36],
  ['toledo', 'Toledo', 'Rockets', 'TOL', 2649, '#15397F', '#FFD200', 'mac', 'Toledo', 'OH', 41.656, -83.613, 'Glass Bowl', 26038, 44],
  ['umass', 'UMass', 'Minutemen', 'MASS', 113, '#881C1C', '#000000', 'mac', 'Amherst', 'MA', 42.377, -72.537, 'Warren McGuirk Alumni Stadium', 17000, 26],
  ['western-michigan', 'Western Michigan', 'Broncos', 'WMU', 2711, '#6C4023', '#B5A167', 'mac', 'Kalamazoo', 'MI', 42.283, -85.614, 'Waldo Stadium', 30200, 40],
  // ---------------------------------------------------------------- Mountain West
  ['air-force', 'Air Force', 'Falcons', 'AF', 2005, '#003087', '#8A8D8F', 'mountain-west', 'Colorado Springs', 'CO', 38.997, -104.844, 'Falcon Stadium', 46692, 48, 'option', '3-4'],
  ['hawaii', 'Hawaii', 'Rainbow Warriors', 'HAW', 62, '#024731', '#FFFFFF', 'mountain-west', 'Honolulu', 'HI', 21.297, -157.817, 'Clarence T.C. Ching Athletics Complex', 15194, 38, 'air_raid'],
  ['nevada', 'Nevada', 'Wolf Pack', 'NEV', 2440, '#003366', '#807F84', 'mountain-west', 'Reno', 'NV', 39.547, -119.817, 'Mackay Stadium', 27000, 32],
  ['new-mexico', 'New Mexico', 'Lobos', 'UNM', 167, '#BA0C2F', '#A7A8AA', 'mountain-west', 'Albuquerque', 'NM', 35.067, -106.629, 'University Stadium', 39224, 36],
  ['north-dakota-state', 'North Dakota State', 'Bison', 'NDSU', 2449, '#0A5640', '#FFC72A', 'mountain-west', 'Fargo', 'ND', 46.897, -96.806, 'Fargodome', 18700, 52, 'pro_style'],
  ['northern-illinois', 'Northern Illinois', 'Huskies', 'NIU', 2459, '#BA0C2F', '#000000', 'mountain-west', 'DeKalb', 'IL', 41.934, -88.778, 'Huskie Stadium', 24000, 42, 'power_run'],
  ['san-jose-state', 'San Jose State', 'Spartans', 'SJSU', 23, '#0055A2', '#E5A823', 'mountain-west', 'San Jose', 'CA', 37.320, -121.868, 'CEFCU Stadium', 21520, 40],
  ['unlv', 'UNLV', 'Rebels', 'UNLV', 2439, '#CF0A2C', '#8A8D8F', 'mountain-west', 'Las Vegas', 'NV', 36.091, -115.184, 'Allegiant Stadium', 65000, 54],
  ['utep', 'UTEP', 'Miners', 'UTEP', 2638, '#FF8200', '#041E42', 'mountain-west', 'El Paso', 'TX', 31.773, -106.508, 'Sun Bowl Stadium', 51500, 30],
  ['wyoming', 'Wyoming', 'Cowboys', 'WYO', 2751, '#492F24', '#FFC425', 'mountain-west', 'Laramie', 'WY', 41.312, -105.568, 'War Memorial Stadium', 29181, 40, 'power_run'],
  // ---------------------------------------------------------------- C-USA
  ['delaware', 'Delaware', 'Blue Hens', 'DEL', 48, '#00539F', '#FFD200', 'cusa', 'Newark', 'DE', 39.665, -75.749, 'Delaware Stadium', 18800, 36],
  ['fiu', 'FIU', 'Panthers', 'FIU', 2229, '#081E3F', '#B6862C', 'cusa', 'Miami', 'FL', 25.752, -80.378, 'Pitbull Stadium', 20000, 32],
  ['jacksonville-state', 'Jacksonville State', 'Gamecocks', 'JVST', 55, '#CC0000', '#FFFFFF', 'cusa', 'Jacksonville', 'AL', 33.820, -85.765, 'AmFirst Stadium', 24000, 40, 'rpo'],
  ['kennesaw-state', 'Kennesaw State', 'Owls', 'KENN', 338, '#FDBB30', '#000000', 'cusa', 'Kennesaw', 'GA', 34.032, -84.581, 'Fifth Third Stadium', 8318, 30],
  ['liberty', 'Liberty', 'Flames', 'LIB', 2335, '#002D62', '#C41230', 'cusa', 'Lynchburg', 'VA', 37.352, -79.179, 'Williams Stadium', 25000, 50],
  ['middle-tennessee', 'Middle Tennessee', 'Blue Raiders', 'MTSU', 2393, '#0066CC', '#FFFFFF', 'cusa', 'Murfreesboro', 'TN', 35.849, -86.367, 'Johnny "Red" Floyd Stadium', 30788, 34],
  ['missouri-state', 'Missouri State', 'Bears', 'MOST', 2623, '#5E0009', '#FFFFFF', 'cusa', 'Springfield', 'MO', 37.198, -93.282, 'Plaster Stadium', 17500, 32],
  ['new-mexico-state', 'New Mexico State', 'Aggies', 'NMSU', 166, '#861F41', '#FFFFFF', 'cusa', 'Las Cruces', 'NM', 32.280, -106.747, 'Aggie Memorial Stadium', 28853, 28],
  ['sam-houston', 'Sam Houston', 'Bearkats', 'SHSU', 2534, '#F47B20', '#FFFFFF', 'cusa', 'Huntsville', 'TX', 30.714, -95.546, 'Elliott T. Bowers Stadium', 14000, 32],
  ['western-kentucky', 'Western Kentucky', 'Hilltoppers', 'WKU', 98, '#C60C30', '#FFFFFF', 'cusa', 'Bowling Green', 'KY', 36.985, -86.459, 'Houchens Industries-L.T. Smith Stadium', 22113, 44, 'air_raid'],
  // ---------------------------------------------------------------- Pac-12
  ['boise-state', 'Boise State', 'Broncos', 'BSU', 68, '#0033A0', '#D64309', 'pac-12', 'Boise', 'ID', 43.603, -116.196, 'Albertsons Stadium', 36387, 68],
  ['colorado-state', 'Colorado State', 'Rams', 'CSU', 36, '#1E4D2B', '#C8C372', 'pac-12', 'Fort Collins', 'CO', 40.570, -105.089, 'Canvas Stadium', 36000, 44],
  ['fresno-state', 'Fresno State', 'Bulldogs', 'FRES', 278, '#DB0032', '#002E6D', 'pac-12', 'Fresno', 'CA', 36.814, -119.758, "Valley Children's Stadium", 40727, 50],
  ['oregon-state', 'Oregon State', 'Beavers', 'ORST', 204, '#DC4405', '#000000', 'pac-12', 'Corvallis', 'OR', 44.559, -123.281, 'Reser Stadium', 35548, 52],
  ['san-diego-state', 'San Diego State', 'Aztecs', 'SDSU', 21, '#A6192E', '#000000', 'pac-12', 'San Diego', 'CA', 32.783, -117.119, 'Snapdragon Stadium', 35000, 50, 'pro_style', '3-3-5'],
  ['texas-state', 'Texas State', 'Bobcats', 'TXST', 326, '#501214', '#8D734A', 'pac-12', 'San Marcos', 'TX', 29.891, -97.925, 'UFCU Stadium', 30000, 48, 'air_raid'],
  ['utah-state', 'Utah State', 'Aggies', 'USU', 328, '#0F2439', '#8A8D8F', 'pac-12', 'Logan', 'UT', 41.752, -111.812, 'Maverik Stadium', 25513, 40],
  ['washington-state', 'Washington State', 'Cougars', 'WSU', 265, '#981E32', '#5E6A71', 'pac-12', 'Pullman', 'WA', 46.732, -117.160, 'Gesa Field at Martin Stadium', 32952, 52, 'air_raid'],
  // ---------------------------------------------------------------- Independents
  ['notre-dame', 'Notre Dame', 'Fighting Irish', 'ND', 87, '#0C2340', '#C99700', 'independent', 'Notre Dame', 'IN', 41.698, -86.234, 'Notre Dame Stadium', 77622, 92, 'pro_style'],
  ['uconn', 'UConn', 'Huskies', 'CONN', 41, '#000E2F', '#FFFFFF', 'independent', 'East Hartford', 'CT', 41.760, -72.619, 'Pratt & Whitney Stadium at Rentschler Field', 40000, 40],
];

export const TEAMS: TeamSeed[] = ROWS.map((r) => ({
  slug: r[0], school: r[1], mascot: r[2], abbreviation: r[3], espnId: r[4], primaryColor: r[5], secondaryColor: r[6],
  conference: r[7], city: r[8], state: r[9], latitude: r[10], longitude: r[11], stadium: r[12], capacity: r[13],
  prestige: r[14], offenseScheme: r[15], defenseScheme: r[16],
}));

export interface RivalrySeed { name: string; a: string; b: string; trophy?: string }

export const RIVALRIES: RivalrySeed[] = [
  { name: 'Iron Bowl', a: 'alabama', b: 'auburn', trophy: 'James E. Foy, V-ODK Sportsmanship Trophy' },
  { name: 'The Game', a: 'ohio-state', b: 'michigan' },
  { name: 'Red River Rivalry', a: 'texas', b: 'oklahoma', trophy: 'Golden Hat' },
  { name: 'Lone Star Showdown', a: 'texas', b: 'texas-am' },
  { name: 'Egg Bowl', a: 'ole-miss', b: 'mississippi-state', trophy: 'Golden Egg' },
  { name: 'Florida–Georgia Game', a: 'florida', b: 'georgia', trophy: 'Okefenokee Oar' },
  { name: 'Sunshine Showdown', a: 'florida', b: 'florida-state' },
  { name: 'Clean, Old-Fashioned Hate', a: 'georgia', b: 'georgia-tech', trophy: "Governor's Cup" },
  { name: 'Palmetto Bowl', a: 'clemson', b: 'south-carolina' },
  { name: 'Battle for the Golden Boot', a: 'lsu', b: 'arkansas', trophy: 'Golden Boot' },
  { name: 'Third Saturday in October', a: 'alabama', b: 'tennessee' },
  { name: 'Battle Line Rivalry', a: 'missouri', b: 'arkansas' },
  { name: "Governor's Cup (Kentucky)", a: 'kentucky', b: 'louisville', trophy: "Governor's Cup" },
  { name: 'Paul Bunyan Trophy', a: 'michigan', b: 'michigan-state', trophy: 'Paul Bunyan Trophy' },
  { name: "Paul Bunyan's Axe", a: 'wisconsin', b: 'minnesota', trophy: "Paul Bunyan's Axe" },
  { name: 'Floyd of Rosedale', a: 'iowa', b: 'minnesota', trophy: 'Floyd of Rosedale' },
  { name: 'Cy-Hawk Series', a: 'iowa', b: 'iowa-state', trophy: 'Cy-Hawk Trophy' },
  { name: 'Old Oaken Bucket', a: 'indiana', b: 'purdue', trophy: 'Old Oaken Bucket' },
  { name: 'Land of Lincoln', a: 'illinois', b: 'northwestern', trophy: 'Land of Lincoln Trophy' },
  { name: 'Heroes Game', a: 'iowa', b: 'nebraska', trophy: 'Heroes Trophy' },
  { name: 'Crosstown Showdown', a: 'usc', b: 'ucla', trophy: 'Victory Bell' },
  { name: 'Jeweled Shillelagh', a: 'usc', b: 'notre-dame', trophy: 'Jeweled Shillelagh' },
  { name: 'Apple Cup', a: 'washington', b: 'washington-state', trophy: 'Apple Cup' },
  { name: 'Platypus Trophy Game', a: 'oregon', b: 'oregon-state', trophy: 'Platypus Trophy' },
  { name: 'Duel in the Desert', a: 'arizona', b: 'arizona-state', trophy: 'Territorial Cup' },
  { name: 'Holy War', a: 'byu', b: 'utah', trophy: 'Beehive Boot' },
  { name: 'Sunflower Showdown', a: 'kansas', b: 'kansas-state', trophy: 'Governor\'s Cup' },
  { name: 'The Revivalry', a: 'baylor', b: 'tcu' },
  { name: 'Battle for the Iron Skillet', a: 'tcu', b: 'smu', trophy: 'Iron Skillet' },
  { name: 'Backyard Brawl', a: 'pittsburgh', b: 'west-virginia' },
  { name: 'Commonwealth Clash', a: 'virginia', b: 'virginia-tech', trophy: 'Commonwealth Cup' },
  { name: "South's Oldest Rivalry", a: 'virginia', b: 'north-carolina' },
  { name: 'Tobacco Road', a: 'duke', b: 'north-carolina', trophy: 'Victory Bell' },
  { name: 'Textile Bowl', a: 'clemson', b: 'nc-state' },
  { name: 'The Big Game', a: 'california', b: 'stanford', trophy: 'Stanford Axe' },
  { name: 'Army–Navy Game', a: 'army', b: 'navy', trophy: "Commander-in-Chief's Trophy" },
  { name: 'Notre Dame–Navy', a: 'notre-dame', b: 'navy' },
  { name: 'Battle of I-75', a: 'toledo', b: 'bowling-green', trophy: 'Peace Pipe' },
  { name: 'Battle of the Bricks', a: 'miami-oh', b: 'ohio' },
  { name: 'Michigan MAC Trophy', a: 'central-michigan', b: 'western-michigan' },
  { name: 'Battle for the Milk Can', a: 'boise-state', b: 'fresno-state', trophy: 'Milk Can' },
  { name: 'Battle for Nevada', a: 'unlv', b: 'nevada', trophy: 'Fremont Cannon' },
  { name: 'Rio Grande Rivalry', a: 'new-mexico', b: 'new-mexico-state', trophy: "Maloof Trophy" },
  { name: 'Rocky Mountain Showdown', a: 'colorado', b: 'colorado-state' },
  { name: 'Border War', a: 'wyoming', b: 'colorado-state', trophy: 'Bronze Boot' },
  { name: 'Royal Rivalry', a: 'old-dominion', b: 'james-madison' },
  { name: "Deep South's Oldest Rivalry", a: 'auburn', b: 'georgia' },
  { name: 'Miami–Florida State', a: 'miami-fl', b: 'florida-state' },
  { name: 'I-35 Rivalry', a: 'texas-state', b: 'utsa' },
  { name: 'Deeper Than Hate', a: 'appalachian-state', b: 'georgia-southern' },
  { name: 'Battle on the Bayou', a: 'louisiana', b: 'ul-monroe' },
  { name: '100 Miles of Hate', a: 'western-kentucky', b: 'middle-tennessee' },
  { name: 'Old Oil Can', a: 'san-diego-state', b: 'fresno-state', trophy: 'Old Oil Can' },
  { name: 'Battle of the Palouse', a: 'washington-state', b: 'oregon-state' },
];

export const TV_NETWORKS = [
  { name: 'Universe Broadcasting Company', shortName: 'UBC', tier: 1 },
  { name: 'CFU Network', shortName: 'CFUN', tier: 1 },
  { name: 'Saturday Prime', shortName: 'SPRM', tier: 2 },
  { name: 'Gridiron Sports 1', shortName: 'GS1', tier: 2 },
  { name: 'Campus Sports Channel', shortName: 'CSC', tier: 3 },
  { name: 'CFU+ Streaming', shortName: 'CFU+', tier: 4 },
];
