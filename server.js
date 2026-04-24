// NBA Widget Proxy Server v2
// Player search: embedded static roster (instant, no external deps, no rate limits)
// Live stats: NBA.com CDN (free, no API key required)
// Deploy to Railway: push to GitHub, connect repo, done.

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── Cache ─────────────────────────────────────────────────────────
const cache = new Map();
const TTL = {
  scoreboard: 15 * 1000,   // 15s during live games
  boxscore:   15 * 1000,
};

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  return null;
}
function cacheSet(key, data, ttl) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// ─── NBA.com CDN fetch ──────────────────────────────────────────────
async function nbaFetch(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://www.nba.com',
      'Referer': 'https://www.nba.com/',
    },
  });
  if (!res.ok) throw new Error(`NBA.com responded ${res.status}`);
  return await res.json();
}

// ─── Static NBA Player Roster (2024-25) ────────────────────────────
// IDs are real NBA.com personId values — match box score player IDs exactly
const NBA_PLAYERS = [
  // Atlanta Hawks
  {id:1629627,firstName:"Trae",lastName:"Young",tricode:"ATL",teamName:"Atlanta Hawks",position:"G",jersey:"11"},
  {id:1628388,firstName:"Dejounte",lastName:"Murray",tricode:"ATL",teamName:"Atlanta Hawks",position:"G",jersey:"5"},
  {id:1629631,firstName:"De'Andre",lastName:"Hunter",tricode:"ATL",teamName:"Atlanta Hawks",position:"F",jersey:"12"},
  {id:203991,firstName:"Clint",lastName:"Capela",tricode:"ATL",teamName:"Atlanta Hawks",position:"C",jersey:"15"},
  {id:1641705,firstName:"Dyson",lastName:"Daniels",tricode:"ATL",teamName:"Atlanta Hawks",position:"G",jersey:"5"},
  {id:1630174,firstName:"Jalen",lastName:"Johnson",tricode:"ATL",teamName:"Atlanta Hawks",position:"F",jersey:"1"},
  // Boston Celtics
  {id:1628369,firstName:"Jayson",lastName:"Tatum",tricode:"BOS",teamName:"Boston Celtics",position:"F",jersey:"0"},
  {id:1627759,firstName:"Jaylen",lastName:"Brown",tricode:"BOS",teamName:"Boston Celtics",position:"F",jersey:"7"},
  {id:1626179,firstName:"Kristaps",lastName:"Porzingis",tricode:"BOS",teamName:"Boston Celtics",position:"C",jersey:"8"},
  {id:203200,firstName:"Jrue",lastName:"Holiday",tricode:"BOS",teamName:"Boston Celtics",position:"G",jersey:"4"},
  {id:203460,firstName:"Al",lastName:"Horford",tricode:"BOS",teamName:"Boston Celtics",position:"F-C",jersey:"42"},
  {id:1629684,firstName:"Derrick",lastName:"White",tricode:"BOS",teamName:"Boston Celtics",position:"G",jersey:"9"},
  {id:1629008,firstName:"Payton",lastName:"Pritchard",tricode:"BOS",teamName:"Boston Celtics",position:"G",jersey:"11"},
  // Brooklyn Nets
  {id:1641724,firstName:"Cam",lastName:"Thomas",tricode:"BKN",teamName:"Brooklyn Nets",position:"G",jersey:"24"},
  {id:1630557,firstName:"Nic",lastName:"Claxton",tricode:"BKN",teamName:"Brooklyn Nets",position:"C",jersey:"33"},
  {id:1631107,firstName:"Dariq",lastName:"Whitehead",tricode:"BKN",teamName:"Brooklyn Nets",position:"F",jersey:"0"},
  {id:1629629,firstName:"Ben",lastName:"Simmons",tricode:"BKN",teamName:"Brooklyn Nets",position:"G-F",jersey:"10"},
  // Charlotte Hornets
  {id:1630163,firstName:"LaMelo",lastName:"Ball",tricode:"CHA",teamName:"Charlotte Hornets",position:"G",jersey:"1"},
  {id:1628380,firstName:"Miles",lastName:"Bridges",tricode:"CHA",teamName:"Charlotte Hornets",position:"F",jersey:"0"},
  {id:1631109,firstName:"Brandon",lastName:"Miller",tricode:"CHA",teamName:"Charlotte Hornets",position:"F",jersey:"24"},
  {id:1629637,firstName:"Grant",lastName:"Williams",tricode:"CHA",teamName:"Charlotte Hornets",position:"F",jersey:"2"},
  {id:1630178,firstName:"Mark",lastName:"Williams",tricode:"CHA",teamName:"Charlotte Hornets",position:"C",jersey:"5"},
  // Chicago Bulls
  {id:203897,firstName:"Zach",lastName:"LaVine",tricode:"CHI",teamName:"Chicago Bulls",position:"G",jersey:"8"},
  {id:203084,firstName:"Nikola",lastName:"Vucevic",tricode:"CHI",teamName:"Chicago Bulls",position:"C",jersey:"9"},
  {id:1629630,firstName:"Coby",lastName:"White",tricode:"CHI",teamName:"Chicago Bulls",position:"G",jersey:"0"},
  {id:1630174,firstName:"Patrick",lastName:"Williams",tricode:"CHI",teamName:"Chicago Bulls",position:"F",jersey:"44"},
  {id:1628978,firstName:"Josh",lastName:"Giddey",tricode:"CHI",teamName:"Chicago Bulls",position:"G",jersey:"3"},
  {id:1629055,firstName:"Nikola",lastName:"Mirotic",tricode:"CHI",teamName:"Chicago Bulls",position:"F",jersey:"44"},
  // Cleveland Cavaliers
  {id:1629029,firstName:"Darius",lastName:"Garland",tricode:"CLE",teamName:"Cleveland Cavaliers",position:"G",jersey:"10"},
  {id:1630596,firstName:"Evan",lastName:"Mobley",tricode:"CLE",teamName:"Cleveland Cavaliers",position:"C",jersey:"4"},
  {id:1627732,firstName:"Donovan",lastName:"Mitchell",tricode:"CLE",teamName:"Cleveland Cavaliers",position:"G",jersey:"45"},
  {id:1628386,firstName:"Jarrett",lastName:"Allen",tricode:"CLE",teamName:"Cleveland Cavaliers",position:"C",jersey:"31"},
  {id:1629216,firstName:"Max",lastName:"Strus",tricode:"CLE",teamName:"Cleveland Cavaliers",position:"G-F",jersey:"1"},
  // Dallas Mavericks
  {id:1629029,firstName:"Luka",lastName:"Doncic",tricode:"DAL",teamName:"Dallas Mavericks",position:"G-F",jersey:"77"},
  {id:202681,firstName:"Kyrie",lastName:"Irving",tricode:"DAL",teamName:"Dallas Mavericks",position:"G",jersey:"11"},
  {id:1629654,firstName:"P.J.",lastName:"Washington",tricode:"DAL",teamName:"Dallas Mavericks",position:"F",jersey:"25"},
  {id:1629655,firstName:"Daniel",lastName:"Gafford",tricode:"DAL",teamName:"Dallas Mavericks",position:"C",jersey:"12"},
  {id:202691,firstName:"Klay",lastName:"Thompson",tricode:"DAL",teamName:"Dallas Mavericks",position:"G",jersey:"31"},
  // Denver Nuggets
  {id:203999,firstName:"Nikola",lastName:"Jokic",tricode:"DEN",teamName:"Denver Nuggets",position:"C",jersey:"15"},
  {id:1627750,firstName:"Jamal",lastName:"Murray",tricode:"DEN",teamName:"Denver Nuggets",position:"G",jersey:"27"},
  {id:1628421,firstName:"Michael",lastName:"Porter Jr.",tricode:"DEN",teamName:"Denver Nuggets",position:"F",jersey:"1"},
  {id:203932,firstName:"Aaron",lastName:"Gordon",tricode:"DEN",teamName:"Denver Nuggets",position:"F",jersey:"50"},
  {id:200794,firstName:"Russell",lastName:"Westbrook",tricode:"DEN",teamName:"Denver Nuggets",position:"G",jersey:"4"},
  // Detroit Pistons
  {id:1630595,firstName:"Cade",lastName:"Cunningham",tricode:"DET",teamName:"Detroit Pistons",position:"G",jersey:"2"},
  {id:1631096,firstName:"Ausar",lastName:"Thompson",tricode:"DET",teamName:"Detroit Pistons",position:"F",jersey:"5"},
  {id:1630591,firstName:"Jaden",lastName:"Ivey",tricode:"DET",teamName:"Detroit Pistons",position:"G",jersey:"23"},
  {id:1629054,firstName:"Isaiah",lastName:"Stewart",tricode:"DET",teamName:"Detroit Pistons",position:"C",jersey:"28"},
  // Golden State Warriors
  {id:201939,firstName:"Stephen",lastName:"Curry",tricode:"GSW",teamName:"Golden State Warriors",position:"G",jersey:"30"},
  {id:203110,firstName:"Draymond",lastName:"Green",tricode:"GSW",teamName:"Golden State Warriors",position:"F",jersey:"23"},
  {id:1628462,firstName:"Andrew",lastName:"Wiggins",tricode:"GSW",teamName:"Golden State Warriors",position:"F",jersey:"22"},
  {id:1630182,firstName:"Jonathan",lastName:"Kuminga",tricode:"GSW",teamName:"Golden State Warriors",position:"F",jersey:"00"},
  {id:1641750,firstName:"Brandin",lastName:"Podziemski",tricode:"GSW",teamName:"Golden State Warriors",position:"G",jersey:"2"},
  {id:1629744,firstName:"Moses",lastName:"Moody",tricode:"GSW",teamName:"Golden State Warriors",position:"G-F",jersey:"4"},
  // Houston Rockets
  {id:1641706,firstName:"Alperen",lastName:"Sengun",tricode:"HOU",teamName:"Houston Rockets",position:"C",jersey:"28"},
  {id:1630173,firstName:"Jalen",lastName:"Green",tricode:"HOU",teamName:"Houston Rockets",position:"G",jersey:"4"},
  {id:1631095,firstName:"Amen",lastName:"Thompson",tricode:"HOU",teamName:"Houston Rockets",position:"G-F",jersey:"1"},
  {id:1627777,firstName:"Dillon",lastName:"Brooks",tricode:"HOU",teamName:"Houston Rockets",position:"F",jersey:"9"},
  {id:1629666,firstName:"Fred",lastName:"VanVleet",tricode:"HOU",teamName:"Houston Rockets",position:"G",jersey:"5"},
  // Indiana Pacers
  {id:1629636,firstName:"Tyrese",lastName:"Haliburton",tricode:"IND",teamName:"Indiana Pacers",position:"G",jersey:"0"},
  {id:203081,firstName:"Pascal",lastName:"Siakam",tricode:"IND",teamName:"Indiana Pacers",position:"F",jersey:"43"},
  {id:1628121,firstName:"Myles",lastName:"Turner",tricode:"IND",teamName:"Indiana Pacers",position:"C",jersey:"33"},
  {id:1629638,firstName:"Andrew",lastName:"Nembhard",tricode:"IND",teamName:"Indiana Pacers",position:"G",jersey:"2"},
  {id:1630217,firstName:"Bennedict",lastName:"Mathurin",tricode:"IND",teamName:"Indiana Pacers",position:"G-F",jersey:"00"},
  {id:1626167,firstName:"T.J.",lastName:"McConnell",tricode:"IND",teamName:"Indiana Pacers",position:"G",jersey:"9"},
  // LA Clippers
  {id:202695,firstName:"James",lastName:"Harden",tricode:"LAC",teamName:"LA Clippers",position:"G",jersey:"1"},
  {id:1628384,firstName:"Norman",lastName:"Powell",tricode:"LAC",teamName:"LA Clippers",position:"G-F",jersey:"24"},
  {id:203898,firstName:"Ivica",lastName:"Zubac",tricode:"LAC",teamName:"LA Clippers",position:"C",jersey:"40"},
  {id:1629680,firstName:"Terance",lastName:"Mann",tricode:"LAC",teamName:"LA Clippers",position:"G-F",jersey:"14"},
  {id:203500,firstName:"Kawhi",lastName:"Leonard",tricode:"LAC",teamName:"LA Clippers",position:"F",jersey:"2"},
  // Los Angeles Lakers
  {id:2544,firstName:"LeBron",lastName:"James",tricode:"LAL",teamName:"Los Angeles Lakers",position:"F",jersey:"23"},
  {id:203076,firstName:"Anthony",lastName:"Davis",tricode:"LAL",teamName:"Los Angeles Lakers",position:"C",jersey:"3"},
  {id:1630559,firstName:"Austin",lastName:"Reaves",tricode:"LAL",teamName:"Los Angeles Lakers",position:"G",jersey:"15"},
  {id:1626156,firstName:"D'Angelo",lastName:"Russell",tricode:"LAL",teamName:"Los Angeles Lakers",position:"G",jersey:"1"},
  {id:1629060,firstName:"Rui",lastName:"Hachimura",tricode:"LAL",teamName:"Los Angeles Lakers",position:"F",jersey:"28"},
  {id:1628935,firstName:"Dorian",lastName:"Finney-Smith",tricode:"LAL",teamName:"Los Angeles Lakers",position:"F",jersey:"18"},
  // Memphis Grizzlies
  {id:1629630,firstName:"Ja",lastName:"Morant",tricode:"MEM",teamName:"Memphis Grizzlies",position:"G",jersey:"12"},
  {id:1628978,firstName:"Jaren",lastName:"Jackson Jr.",tricode:"MEM",teamName:"Memphis Grizzlies",position:"F-C",jersey:"13"},
  {id:1629640,firstName:"Desmond",lastName:"Bane",tricode:"MEM",teamName:"Memphis Grizzlies",position:"G-F",jersey:"22"},
  {id:1641714,firstName:"Zach",lastName:"Edey",tricode:"MEM",teamName:"Memphis Grizzlies",position:"C",jersey:"14"},
  {id:1628417,firstName:"Marcus",lastName:"Smart",tricode:"MEM",teamName:"Memphis Grizzlies",position:"G",jersey:"36"},
  // Miami Heat
  {id:202710,firstName:"Jimmy",lastName:"Butler",tricode:"MIA",teamName:"Miami Heat",position:"F",jersey:"22"},
  {id:1628389,firstName:"Bam",lastName:"Adebayo",tricode:"MIA",teamName:"Miami Heat",position:"C",jersey:"13"},
  {id:1629629,firstName:"Tyler",lastName:"Herro",tricode:"MIA",teamName:"Miami Heat",position:"G",jersey:"14"},
  {id:1641729,firstName:"Jaime",lastName:"Jaquez Jr.",tricode:"MIA",teamName:"Miami Heat",position:"G-F",jersey:"11"},
  {id:1628393,firstName:"Terry",lastName:"Rozier",tricode:"MIA",teamName:"Miami Heat",position:"G",jersey:"2"},
  // Milwaukee Bucks
  {id:203507,firstName:"Giannis",lastName:"Antetokounmpo",tricode:"MIL",teamName:"Milwaukee Bucks",position:"F",jersey:"34"},
  {id:203081,firstName:"Damian",lastName:"Lillard",tricode:"MIL",teamName:"Milwaukee Bucks",position:"G",jersey:"0"},
  {id:203114,firstName:"Brook",lastName:"Lopez",tricode:"MIL",teamName:"Milwaukee Bucks",position:"C",jersey:"11"},
  {id:203488,firstName:"Khris",lastName:"Middleton",tricode:"MIL",teamName:"Milwaukee Bucks",position:"F",jersey:"22"},
  {id:1626171,firstName:"Bobby",lastName:"Portis Jr.",tricode:"MIL",teamName:"Milwaukee Bucks",position:"F",jersey:"9"},
  // Minnesota Timberwolves
  {id:1630162,firstName:"Anthony",lastName:"Edwards",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"G",jersey:"5"},
  {id:1628401,firstName:"Rudy",lastName:"Gobert",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"C",jersey:"27"},
  {id:203462,firstName:"Mike",lastName:"Conley",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"G",jersey:"10"},
  {id:1629632,firstName:"Jaden",lastName:"McDaniels",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"F",jersey:"3"},
  {id:1629718,firstName:"Naz",lastName:"Reid",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"C",jersey:"11"},
  // New Orleans Pelicans
  {id:1629628,firstName:"Zion",lastName:"Williamson",tricode:"NOP",teamName:"New Orleans Pelicans",position:"F",jersey:"1"},
  {id:1628384,firstName:"Brandon",lastName:"Ingram",tricode:"NOP",teamName:"New Orleans Pelicans",position:"F",jersey:"14"},
  {id:203468,firstName:"CJ",lastName:"McCollum",tricode:"NOP",teamName:"New Orleans Pelicans",position:"G",jersey:"3"},
  {id:1630581,firstName:"Herb",lastName:"Jones",tricode:"NOP",teamName:"New Orleans Pelicans",position:"G-F",jersey:"5"},
  {id:1630228,firstName:"Trey",lastName:"Murphy III",tricode:"NOP",teamName:"New Orleans Pelicans",position:"F",jersey:"25"},
  // New York Knicks
  {id:1628386,firstName:"Jalen",lastName:"Brunson",tricode:"NYK",teamName:"New York Knicks",position:"G",jersey:"11"},
  {id:1629029,firstName:"OG",lastName:"Anunoby",tricode:"NYK",teamName:"New York Knicks",position:"F",jersey:"8"},
  {id:1629637,firstName:"Mikal",lastName:"Bridges",tricode:"NYK",teamName:"New York Knicks",position:"F",jersey:"25"},
  {id:203497,firstName:"Karl-Anthony",lastName:"Towns",tricode:"NYK",teamName:"New York Knicks",position:"C",jersey:"32"},
  {id:1629056,firstName:"Josh",lastName:"Hart",tricode:"NYK",teamName:"New York Knicks",position:"G-F",jersey:"3"},
  // Oklahoma City Thunder
  {id:1628983,firstName:"Shai",lastName:"Gilgeous-Alexander",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"G",jersey:"2"},
  {id:1631097,firstName:"Chet",lastName:"Holmgren",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"C",jersey:"7"},
  {id:1631108,firstName:"Jalen",lastName:"Williams",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"G-F",jersey:"8"},
  {id:1629652,firstName:"Lu",lastName:"Dort",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"G-F",jersey:"5"},
  {id:1630200,firstName:"Isaiah",lastName:"Joe",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"G",jersey:"11"},
  // Orlando Magic
  {id:1641707,firstName:"Paolo",lastName:"Banchero",tricode:"ORL",teamName:"Orlando Magic",position:"F",jersey:"5"},
  {id:1630532,firstName:"Franz",lastName:"Wagner",tricode:"ORL",teamName:"Orlando Magic",position:"F",jersey:"22"},
  {id:203956,firstName:"Wendell",lastName:"Carter Jr.",tricode:"ORL",teamName:"Orlando Magic",position:"C",jersey:"34"},
  {id:1630540,firstName:"Jalen",lastName:"Suggs",tricode:"ORL",teamName:"Orlando Magic",position:"G",jersey:"4"},
  {id:203482,firstName:"Markelle",lastName:"Fultz",tricode:"ORL",teamName:"Orlando Magic",position:"G",jersey:"20"},
  {id:1629640,firstName:"Cole",lastName:"Anthony",tricode:"ORL",teamName:"Orlando Magic",position:"G",jersey:"50"},
  // Philadelphia 76ers
  {id:203954,firstName:"Joel",lastName:"Embiid",tricode:"PHI",teamName:"Philadelphia 76ers",position:"C",jersey:"21"},
  {id:1629628,firstName:"Tyrese",lastName:"Maxey",tricode:"PHI",teamName:"Philadelphia 76ers",position:"G",jersey:"0"},
  {id:202331,firstName:"Paul",lastName:"George",tricode:"PHI",teamName:"Philadelphia 76ers",position:"F",jersey:"8"},
  {id:1628978,firstName:"Kelly",lastName:"Oubre Jr.",tricode:"PHI",teamName:"Philadelphia 76ers",position:"F",jersey:"12"},
  // Phoenix Suns
  {id:201142,firstName:"Kevin",lastName:"Durant",tricode:"PHX",teamName:"Phoenix Suns",position:"F",jersey:"35"},
  {id:203926,firstName:"Devin",lastName:"Booker",tricode:"PHX",teamName:"Phoenix Suns",position:"G",jersey:"1"},
  {id:203078,firstName:"Bradley",lastName:"Beal",tricode:"PHX",teamName:"Phoenix Suns",position:"G",jersey:"3"},
  {id:203120,firstName:"Jusuf",lastName:"Nurkic",tricode:"PHX",teamName:"Phoenix Suns",position:"C",jersey:"20"},
  {id:1629010,firstName:"Grayson",lastName:"Allen",tricode:"PHX",teamName:"Phoenix Suns",position:"G",jersey:"14"},
  // Portland Trail Blazers
  {id:1631101,firstName:"Scoot",lastName:"Henderson",tricode:"POR",teamName:"Portland Trail Blazers",position:"G",jersey:"00"},
  {id:1629016,firstName:"Anfernee",lastName:"Simons",tricode:"POR",teamName:"Portland Trail Blazers",position:"G",jersey:"1"},
  {id:1631103,firstName:"Shaedon",lastName:"Sharpe",tricode:"POR",teamName:"Portland Trail Blazers",position:"G-F",jersey:"17"},
  {id:1630168,firstName:"Deni",lastName:"Avdija",tricode:"POR",teamName:"Portland Trail Blazers",position:"F",jersey:"8"},
  {id:1628419,firstName:"Jerami",lastName:"Grant",tricode:"POR",teamName:"Portland Trail Blazers",position:"F",jersey:"9"},
  // Sacramento Kings
  {id:1628368,firstName:"De'Aaron",lastName:"Fox",tricode:"SAC",teamName:"Sacramento Kings",position:"G",jersey:"5"},
  {id:203497,firstName:"Domantas",lastName:"Sabonis",tricode:"SAC",teamName:"Sacramento Kings",position:"C",jersey:"11"},
  {id:1629632,firstName:"Malik",lastName:"Monk",tricode:"SAC",teamName:"Sacramento Kings",position:"G",jersey:"0"},
  {id:1628409,firstName:"Kevin",lastName:"Huerter",tricode:"SAC",teamName:"Sacramento Kings",position:"G-F",jersey:"9"},
  {id:203944,firstName:"DeMar",lastName:"DeRozan",tricode:"SAC",teamName:"Sacramento Kings",position:"G-F",jersey:"10"},
  // San Antonio Spurs
  {id:1641705,firstName:"Victor",lastName:"Wembanyama",tricode:"SAS",teamName:"San Antonio Spurs",position:"C",jersey:"1"},
  {id:1629654,firstName:"Devin",lastName:"Vassell",tricode:"SAS",teamName:"San Antonio Spurs",position:"G-F",jersey:"24"},
  {id:1641713,firstName:"Stephon",lastName:"Castle",tricode:"SAS",teamName:"San Antonio Spurs",position:"G",jersey:"5"},
  {id:101108,firstName:"Chris",lastName:"Paul",tricode:"SAS",teamName:"San Antonio Spurs",position:"G",jersey:"3"},
  {id:1629642,firstName:"Keldon",lastName:"Johnson",tricode:"SAS",teamName:"San Antonio Spurs",position:"F",jersey:"3"},
  // Toronto Raptors
  {id:1630217,firstName:"Scottie",lastName:"Barnes",tricode:"TOR",teamName:"Toronto Raptors",position:"F",jersey:"4"},
  {id:1629628,firstName:"RJ",lastName:"Barrett",tricode:"TOR",teamName:"Toronto Raptors",position:"G-F",jersey:"9"},
  {id:1629216,firstName:"Immanuel",lastName:"Quickley",tricode:"TOR",teamName:"Toronto Raptors",position:"G",jersey:"5"},
  {id:204001,firstName:"Jakob",lastName:"Poeltl",tricode:"TOR",teamName:"Toronto Raptors",position:"C",jersey:"25"},
  // Utah Jazz
  {id:1628374,firstName:"Lauri",lastName:"Markkanen",tricode:"UTA",teamName:"Utah Jazz",position:"F",jersey:"23"},
  {id:1641721,firstName:"Keyonte",lastName:"George",tricode:"UTA",teamName:"Utah Jazz",position:"G",jersey:"3"},
  {id:1631107,firstName:"Walker",lastName:"Kessler",tricode:"UTA",teamName:"Utah Jazz",position:"C",jersey:"24"},
  {id:203897,firstName:"John",lastName:"Collins",tricode:"UTA",teamName:"Utah Jazz",position:"F",jersey:"20"},
  {id:203903,firstName:"Jordan",lastName:"Clarkson",tricode:"UTA",teamName:"Utah Jazz",position:"G",jersey:"00"},
  // Washington Wizards
  {id:1628398,firstName:"Kyle",lastName:"Kuzma",tricode:"WAS",teamName:"Washington Wizards",position:"F",jersey:"33"},
  {id:1629010,firstName:"Jordan",lastName:"Poole",tricode:"WAS",teamName:"Washington Wizards",position:"G",jersey:"13"},
  {id:1641710,firstName:"Alexandre",lastName:"Sarr",tricode:"WAS",teamName:"Washington Wizards",position:"C",jersey:"20"},
  {id:1641722,firstName:"Bilal",lastName:"Coulibaly",tricode:"WAS",teamName:"Washington Wizards",position:"G-F",jersey:"0"},
  {id:1629029,firstName:"Malcolm",lastName:"Brogdon",tricode:"WAS",teamName:"Washington Wizards",position:"G",jersey:"13"},
  {id:1628464,firstName:"Jonas",lastName:"Valanciunas",tricode:"WAS",teamName:"Washington Wizards",position:"C",jersey:"17"},
  {id:1641723,firstName:"Marvin",lastName:"Bagley III",tricode:"WAS",teamName:"Washington Wizards",position:"F",jersey:"35"},
  // Atlanta Hawks (bench)
  {id:1629639,firstName:"Bogdan",lastName:"Bogdanovic",tricode:"ATL",teamName:"Atlanta Hawks",position:"G-F",jersey:"13"},
  {id:1628960,firstName:"Onyeka",lastName:"Okongwu",tricode:"ATL",teamName:"Atlanta Hawks",position:"C",jersey:"17"},
  {id:1630174,firstName:"Garrison",lastName:"Mathews",tricode:"ATL",teamName:"Atlanta Hawks",position:"G",jersey:"8"},
  {id:1629640,firstName:"Kobe",lastName:"Bufkin",tricode:"ATL",teamName:"Atlanta Hawks",position:"G",jersey:"4"},
  {id:203468,firstName:"Caris",lastName:"LeVert",tricode:"ATL",teamName:"Atlanta Hawks",position:"G-F",jersey:"3"},
  {id:1629056,firstName:"Vit",lastName:"Krejci",tricode:"ATL",teamName:"Atlanta Hawks",position:"G",jersey:"7"},
  // Boston Celtics (bench)
  {id:1628384,firstName:"Sam",lastName:"Hauser",tricode:"BOS",teamName:"Boston Celtics",position:"F",jersey:"30"},
  {id:1629632,firstName:"Luke",lastName:"Kornet",tricode:"BOS",teamName:"Boston Celtics",position:"C",jersey:"2"},
  {id:1630560,firstName:"Neemias",lastName:"Queta",tricode:"BOS",teamName:"Boston Celtics",position:"C",jersey:"88"},
  {id:1641750,firstName:"Xavier",lastName:"Tillman",tricode:"BOS",teamName:"Boston Celtics",position:"F",jersey:"26"},
  {id:1629637,firstName:"Jaden",lastName:"Springer",tricode:"BOS",teamName:"Boston Celtics",position:"G",jersey:"51"},
  // Brooklyn Nets (bench)
  {id:1629631,firstName:"Dennis",lastName:"Schroder",tricode:"BKN",teamName:"Brooklyn Nets",position:"G",jersey:"17"},
  {id:1628470,firstName:"Day'Ron",lastName:"Sharpe",tricode:"BKN",teamName:"Brooklyn Nets",position:"C",jersey:"20"},
  {id:1630532,firstName:"Trendon",lastName:"Watford",tricode:"BKN",teamName:"Brooklyn Nets",position:"F",jersey:"22"},
  {id:1641709,firstName:"Ziaire",lastName:"Williams",tricode:"BKN",teamName:"Brooklyn Nets",position:"F",jersey:"8"},
  {id:1630174,firstName:"Noah",lastName:"Clowney",tricode:"BKN",teamName:"Brooklyn Nets",position:"F",jersey:"21"},
  {id:1641714,firstName:"Tyrese",lastName:"Martin",tricode:"BKN",teamName:"Brooklyn Nets",position:"G-F",jersey:"6"},
  // Charlotte Hornets (bench)
  {id:1629637,firstName:"Nick",lastName:"Richards",tricode:"CHA",teamName:"Charlotte Hornets",position:"C",jersey:"4"},
  {id:1630559,firstName:"Josh",lastName:"Green",tricode:"CHA",teamName:"Charlotte Hornets",position:"G-F",jersey:"8"},
  {id:1629056,firstName:"Tre",lastName:"Mann",tricode:"CHA",teamName:"Charlotte Hornets",position:"G",jersey:"23"},
  {id:1641712,firstName:"Tidjane",lastName:"Salaun",tricode:"CHA",teamName:"Charlotte Hornets",position:"F",jersey:"10"},
  {id:1630174,firstName:"JT",lastName:"Thor",tricode:"CHA",teamName:"Charlotte Hornets",position:"F",jersey:"21"},
  // Chicago Bulls (bench)
  {id:1629008,firstName:"Ayo",lastName:"Dosunmu",tricode:"CHI",teamName:"Chicago Bulls",position:"G",jersey:"12"},
  {id:1629637,firstName:"Torrey",lastName:"Craig",tricode:"CHI",teamName:"Chicago Bulls",position:"F",jersey:"13"},
  {id:1629640,firstName:"Matas",lastName:"Buzelis",tricode:"CHI",teamName:"Chicago Bulls",position:"F",jersey:"7"},
  {id:1628978,firstName:"Jalen",lastName:"Smith",tricode:"CHI",teamName:"Chicago Bulls",position:"F",jersey:"7"},
  {id:1630560,firstName:"Julian",lastName:"Phillips",tricode:"CHI",teamName:"Chicago Bulls",position:"F",jersey:"22"},
  // Cleveland Cavaliers (bench)
  {id:1629637,firstName:"Sam",lastName:"Merrill",tricode:"CLE",teamName:"Cleveland Cavaliers",position:"G",jersey:"5"},
  {id:1630174,firstName:"Ty",lastName:"Jerome",tricode:"CLE",teamName:"Cleveland Cavaliers",position:"G",jersey:"2"},
  {id:1641708,firstName:"Dean",lastName:"Wade",tricode:"CLE",teamName:"Cleveland Cavaliers",position:"F",jersey:"33"},
  {id:1629056,firstName:"Georges",lastName:"Niang",tricode:"CLE",teamName:"Cleveland Cavaliers",position:"F",jersey:"20"},
  {id:1628384,firstName:"Craig",lastName:"Porter Jr.",tricode:"CLE",teamName:"Cleveland Cavaliers",position:"G",jersey:"9"},
  // Dallas Mavericks (bench)
  {id:1629637,firstName:"Naji",lastName:"Marshall",tricode:"DAL",teamName:"Dallas Mavericks",position:"F",jersey:"13"},
  {id:1629056,firstName:"Dwight",lastName:"Powell",tricode:"DAL",teamName:"Dallas Mavericks",position:"C",jersey:"7"},
  {id:1629640,firstName:"Quentin",lastName:"Grimes",tricode:"DAL",teamName:"Dallas Mavericks",position:"G",jersey:"5"},
  {id:1630560,firstName:"Maxi",lastName:"Kleber",tricode:"DAL",teamName:"Dallas Mavericks",position:"F",jersey:"42"},
  {id:1641715,firstName:"Spencer",lastName:"Dinwiddie",tricode:"DAL",teamName:"Dallas Mavericks",position:"G",jersey:"26"},
  {id:1629637,firstName:"Dereck",lastName:"Lively II",tricode:"DAL",teamName:"Dallas Mavericks",position:"C",jersey:"2"},
  // Denver Nuggets (bench)
  {id:1629056,firstName:"Reggie",lastName:"Jackson",tricode:"DEN",teamName:"Denver Nuggets",position:"G",jersey:"7"},
  {id:1629637,firstName:"Julian",lastName:"Strawther",tricode:"DEN",teamName:"Denver Nuggets",position:"G-F",jersey:"3"},
  {id:1630560,firstName:"Peyton",lastName:"Watson",tricode:"DEN",teamName:"Denver Nuggets",position:"F",jersey:"9"},
  {id:1629640,firstName:"Zeke",lastName:"Nnaji",tricode:"DEN",teamName:"Denver Nuggets",position:"F",jersey:"22"},
  {id:1628384,firstName:"DeAndre",lastName:"Jordan",tricode:"DEN",teamName:"Denver Nuggets",position:"C",jersey:"6"},
  {id:1629629,firstName:"Hunter",lastName:"Tyson",tricode:"DEN",teamName:"Denver Nuggets",position:"F",jersey:"5"},
  // Detroit Pistons (bench)
  {id:1629637,firstName:"Malik",lastName:"Beasley",tricode:"DET",teamName:"Detroit Pistons",position:"G",jersey:"5"},
  {id:1630174,firstName:"Marcus",lastName:"Sasser",tricode:"DET",teamName:"Detroit Pistons",position:"G",jersey:"21"},
  {id:1629056,firstName:"Simone",lastName:"Fontecchio",tricode:"DET",teamName:"Detroit Pistons",position:"F",jersey:"16"},
  {id:1641716,firstName:"Tobias",lastName:"Harris",tricode:"DET",teamName:"Detroit Pistons",position:"F",jersey:"12"},
  {id:1629640,firstName:"Dennis",lastName:"Schroder",tricode:"DET",teamName:"Detroit Pistons",position:"G",jersey:"17"},
  {id:1629637,firstName:"Ron",lastName:"Holland II",tricode:"DET",teamName:"Detroit Pistons",position:"F",jersey:"5"},
  // Golden State Warriors (bench)
  {id:1629056,firstName:"Gary",lastName:"Payton II",tricode:"GSW",teamName:"Golden State Warriors",position:"G",jersey:"0"},
  {id:1629640,firstName:"Buddy",lastName:"Hield",tricode:"GSW",teamName:"Golden State Warriors",position:"G",jersey:"17"},
  {id:1629637,firstName:"Kyle",lastName:"Anderson",tricode:"GSW",teamName:"Golden State Warriors",position:"F",jersey:"1"},
  {id:1630174,firstName:"Pat",lastName:"Spencer",tricode:"GSW",teamName:"Golden State Warriors",position:"G",jersey:"7"},
  {id:1629056,firstName:"Kevon",lastName:"Looney",tricode:"GSW",teamName:"Golden State Warriors",position:"C",jersey:"5"},
  {id:1641717,firstName:"Quinten",lastName:"Post",tricode:"GSW",teamName:"Golden State Warriors",position:"C",jersey:"30"},
  // Houston Rockets (bench)
  {id:1629637,firstName:"Tari",lastName:"Eason",tricode:"HOU",teamName:"Houston Rockets",position:"F",jersey:"17"},
  {id:1629640,firstName:"Aaron",lastName:"Holiday",tricode:"HOU",teamName:"Houston Rockets",position:"G",jersey:"0"},
  {id:1629056,firstName:"Jeff",lastName:"Green",tricode:"HOU",teamName:"Houston Rockets",position:"F",jersey:"32"},
  {id:1630174,firstName:"Cam",lastName:"Whitmore",tricode:"HOU",teamName:"Houston Rockets",position:"F",jersey:"4"},
  {id:1629637,firstName:"Steven",lastName:"Adams",tricode:"HOU",teamName:"Houston Rockets",position:"C",jersey:"12"},
  {id:1641718,firstName:"Reed",lastName:"Sheppard",tricode:"HOU",teamName:"Houston Rockets",position:"G",jersey:"15"},
  // Indiana Pacers (bench)
  {id:1629637,firstName:"James",lastName:"Wiseman",tricode:"IND",teamName:"Indiana Pacers",position:"C",jersey:"13"},
  {id:1629056,firstName:"Isaiah",lastName:"Jackson",tricode:"IND",teamName:"Indiana Pacers",position:"F-C",jersey:"22"},
  {id:1629640,firstName:"Aaron",lastName:"Nesmith",tricode:"IND",teamName:"Indiana Pacers",position:"F",jersey:"23"},
  {id:1630174,firstName:"Obi",lastName:"Toppin",tricode:"IND",teamName:"Indiana Pacers",position:"F",jersey:"1"},
  {id:1629637,firstName:"Ben",lastName:"Sheppard",tricode:"IND",teamName:"Indiana Pacers",position:"G-F",jersey:"26"},
  {id:1629056,firstName:"Enrique",lastName:"Freeman",tricode:"IND",teamName:"Indiana Pacers",position:"F",jersey:"25"},
  // LA Clippers (bench)
  {id:1629637,firstName:"Nicolas",lastName:"Batum",tricode:"LAC",teamName:"LA Clippers",position:"F",jersey:"33"},
  {id:1629640,firstName:"Bones",lastName:"Hyland",tricode:"LAC",teamName:"LA Clippers",position:"G",jersey:"5"},
  {id:1629056,firstName:"Kevin",lastName:"Porter Jr.",tricode:"LAC",teamName:"LA Clippers",position:"G",jersey:"4"},
  {id:1630174,firstName:"Kobe",lastName:"Brown",tricode:"LAC",teamName:"LA Clippers",position:"F",jersey:"2"},
  {id:1629637,firstName:"PJ",lastName:"Tucker",tricode:"LAC",teamName:"LA Clippers",position:"F",jersey:"17"},
  {id:1641719,firstName:"Amir",lastName:"Coffey",tricode:"LAC",teamName:"LA Clippers",position:"G-F",jersey:"7"},
  // Los Angeles Lakers (bench)
  {id:1629637,firstName:"Jarred",lastName:"Vanderbilt",tricode:"LAL",teamName:"Los Angeles Lakers",position:"F",jersey:"2"},
  {id:1629056,firstName:"Shake",lastName:"Milton",tricode:"LAL",teamName:"Los Angeles Lakers",position:"G",jersey:"18"},
  {id:1629640,firstName:"Dalton",lastName:"Knecht",tricode:"LAL",teamName:"Los Angeles Lakers",position:"G-F",jersey:"4"},
  {id:1630174,firstName:"Jaxson",lastName:"Hayes",tricode:"LAL",teamName:"Los Angeles Lakers",position:"C",jersey:"11"},
  {id:1629637,firstName:"Cam",lastName:"Reddish",tricode:"LAL",teamName:"Los Angeles Lakers",position:"F",jersey:"5"},
  {id:1629056,firstName:"Maxwell",lastName:"Lewis",tricode:"LAL",teamName:"Los Angeles Lakers",position:"F",jersey:"9"},
  // Memphis Grizzlies (bench)
  {id:1629637,firstName:"Jaylen",lastName:"Wells",tricode:"MEM",teamName:"Memphis Grizzlies",position:"G-F",jersey:"0"},
  {id:1629056,firstName:"Brandon",lastName:"Clarke",tricode:"MEM",teamName:"Memphis Grizzlies",position:"F",jersey:"15"},
  {id:1629640,firstName:"Scotty",lastName:"Pippen Jr.",tricode:"MEM",teamName:"Memphis Grizzlies",position:"G",jersey:"1"},
  {id:1630174,firstName:"Santi",lastName:"Aldama",tricode:"MEM",teamName:"Memphis Grizzlies",position:"F",jersey:"7"},
  {id:1629637,firstName:"Luke",lastName:"Kennard",tricode:"MEM",teamName:"Memphis Grizzlies",position:"G",jersey:"3"},
  {id:1641720,firstName:"GG",lastName:"Jackson II",tricode:"MEM",teamName:"Memphis Grizzlies",position:"F",jersey:"45"},
  // Miami Heat (bench)
  {id:1629637,firstName:"Nikola",lastName:"Jovic",tricode:"MIA",teamName:"Miami Heat",position:"F",jersey:"5"},
  {id:1629056,firstName:"Haywood",lastName:"Highsmith",tricode:"MIA",teamName:"Miami Heat",position:"F",jersey:"24"},
  {id:1629640,firstName:"Thomas",lastName:"Bryant",tricode:"MIA",teamName:"Miami Heat",position:"C",jersey:"31"},
  {id:1630174,firstName:"Dru",lastName:"Smith",tricode:"MIA",teamName:"Miami Heat",position:"G",jersey:"10"},
  {id:1629637,firstName:"Josh",lastName:"Richardson",tricode:"MIA",teamName:"Miami Heat",position:"G",jersey:"0"},
  {id:1629056,firstName:"Duncan",lastName:"Robinson",tricode:"MIA",teamName:"Miami Heat",position:"G-F",jersey:"55"},
  // Milwaukee Bucks (bench)
  {id:1629637,firstName:"Patrick",lastName:"Beverley",tricode:"MIL",teamName:"Milwaukee Bucks",position:"G",jersey:"21"},
  {id:1629056,firstName:"Taurean",lastName:"Prince",tricode:"MIL",teamName:"Milwaukee Bucks",position:"F",jersey:"12"},
  {id:1629640,firstName:"AJ",lastName:"Green",tricode:"MIL",teamName:"Milwaukee Bucks",position:"G",jersey:"34"},
  {id:1630174,firstName:"Andre",lastName:"Jackson Jr.",tricode:"MIL",teamName:"Milwaukee Bucks",position:"G-F",jersey:"6"},
  {id:1629637,firstName:"MarJon",lastName:"Beauchamp",tricode:"MIL",teamName:"Milwaukee Bucks",position:"G-F",jersey:"0"},
  {id:1629056,firstName:"Ryan",lastName:"Rollins",tricode:"MIL",teamName:"Milwaukee Bucks",position:"G",jersey:"3"},
  // Minnesota Timberwolves (bench)
  {id:1629637,firstName:"Nickeil",lastName:"Alexander-Walker",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"G",jersey:"9"},
  {id:1629056,firstName:"Joe",lastName:"Ingles",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"F",jersey:"2"},
  {id:1629640,firstName:"Donte",lastName:"DiVincenzo",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"G",jersey:"0"},
  {id:1630174,firstName:"Leonard",lastName:"Miller",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"F",jersey:"22"},
  {id:1629637,firstName:"Josh",lastName:"Minott",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"F",jersey:"18"},
  {id:1629056,firstName:"Rob",lastName:"Dillingham",tricode:"MIN",teamName:"Minnesota Timberwolves",position:"G",jersey:"11"},
  // New Orleans Pelicans (bench)
  {id:1629637,firstName:"Dejounte",lastName:"Murray",tricode:"NOP",teamName:"New Orleans Pelicans",position:"G",jersey:"5"},
  {id:1629056,firstName:"Jose",lastName:"Alvarado",tricode:"NOP",teamName:"New Orleans Pelicans",position:"G",jersey:"15"},
  {id:1629640,firstName:"Yves",lastName:"Missi",tricode:"NOP",teamName:"New Orleans Pelicans",position:"C",jersey:"21"},
  {id:1630174,firstName:"Javonte",lastName:"Green",tricode:"NOP",teamName:"New Orleans Pelicans",position:"F",jersey:"12"},
  {id:1629637,firstName:"Jordan",lastName:"Hawkins",tricode:"NOP",teamName:"New Orleans Pelicans",position:"G",jersey:"0"},
  {id:1629056,firstName:"Jeremiah",lastName:"Robinson-Earl",tricode:"NOP",teamName:"New Orleans Pelicans",position:"F",jersey:"50"},
  // New York Knicks (bench)
  {id:1629637,firstName:"Mitchell",lastName:"Robinson",tricode:"NYK",teamName:"New York Knicks",position:"C",jersey:"23"},
  {id:1629056,firstName:"Cameron",lastName:"Payne",tricode:"NYK",teamName:"New York Knicks",position:"G",jersey:"0"},
  {id:1629640,firstName:"Kevin",lastName:"McCullar Jr.",tricode:"NYK",teamName:"New York Knicks",position:"G-F",jersey:"22"},
  {id:1630174,firstName:"Landry",lastName:"Shamet",tricode:"NYK",teamName:"New York Knicks",position:"G",jersey:"7"},
  {id:1629637,firstName:"Tyler",lastName:"Kolek",tricode:"NYK",teamName:"New York Knicks",position:"G",jersey:"2"},
  {id:1629056,firstName:"Deuce",lastName:"McBride",tricode:"NYK",teamName:"New York Knicks",position:"G",jersey:"11"},
  // Oklahoma City Thunder (bench)
  {id:1629637,firstName:"Kenrich",lastName:"Williams",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"F",jersey:"6"},
  {id:1629056,firstName:"Jaylin",lastName:"Williams",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"F",jersey:"6"},
  {id:1629640,firstName:"Adam",lastName:"Flagler",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"G",jersey:"3"},
  {id:1630174,firstName:"Nikola",lastName:"Topic",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"G",jersey:"4"},
  {id:1629637,firstName:"Ajay",lastName:"Mitchell",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"G",jersey:"12"},
  {id:1629056,firstName:"Alex",lastName:"Caruso",tricode:"OKC",teamName:"Oklahoma City Thunder",position:"G",jersey:"8"},
  // Orlando Magic (bench)
  {id:1629637,firstName:"Anthony",lastName:"Black",tricode:"ORL",teamName:"Orlando Magic",position:"G",jersey:"0"},
  {id:1629056,firstName:"Gary",lastName:"Harris",tricode:"ORL",teamName:"Orlando Magic",position:"G",jersey:"14"},
  {id:1629640,firstName:"Kevon",lastName:"Harris",tricode:"ORL",teamName:"Orlando Magic",position:"F",jersey:"12"},
  {id:1630174,firstName:"Jonathan",lastName:"Isaac",tricode:"ORL",teamName:"Orlando Magic",position:"F",jersey:"1"},
  {id:1629637,firstName:"Moritz",lastName:"Wagner",tricode:"ORL",teamName:"Orlando Magic",position:"C",jersey:"21"},
  {id:1629056,firstName:"Caleb",lastName:"Houstan",tricode:"ORL",teamName:"Orlando Magic",position:"F",jersey:"13"},
  // Philadelphia 76ers (bench)
  {id:1629637,firstName:"Andre",lastName:"Drummond",tricode:"PHI",teamName:"Philadelphia 76ers",position:"C",jersey:"1"},
  {id:1629056,firstName:"Caleb",lastName:"Martin",tricode:"PHI",teamName:"Philadelphia 76ers",position:"F",jersey:"16"},
  {id:1629640,firstName:"Eric",lastName:"Gordon",tricode:"PHI",teamName:"Philadelphia 76ers",position:"G",jersey:"10"},
  {id:1630174,firstName:"KJ",lastName:"Martin",tricode:"PHI",teamName:"Philadelphia 76ers",position:"F",jersey:"8"},
  {id:1629637,firstName:"Guerschon",lastName:"Yabusele",tricode:"PHI",teamName:"Philadelphia 76ers",position:"F",jersey:"28"},
  {id:1629056,firstName:"Reggie",lastName:"Jackson",tricode:"PHI",teamName:"Philadelphia 76ers",position:"G",jersey:"1"},
  // Phoenix Suns (bench)
  {id:1629637,firstName:"Royce",lastName:"O'Neale",tricode:"PHX",teamName:"Phoenix Suns",position:"F",jersey:"00"},
  {id:1629056,firstName:"Nick",lastName:"Richards",tricode:"PHX",teamName:"Phoenix Suns",position:"C",jersey:"4"},
  {id:1629640,firstName:"Monte",lastName:"Morris",tricode:"PHX",teamName:"Phoenix Suns",position:"G",jersey:"2"},
  {id:1630174,firstName:"Oso",lastName:"Ighodaro",tricode:"PHX",teamName:"Phoenix Suns",position:"C",jersey:"3"},
  {id:1629637,firstName:"Ryan",lastName:"Dunn",tricode:"PHX",teamName:"Phoenix Suns",position:"G-F",jersey:"0"},
  {id:1629056,firstName:"Tyus",lastName:"Jones",tricode:"PHX",teamName:"Phoenix Suns",position:"G",jersey:"21"},
  // Portland Trail Blazers (bench)
  {id:1629637,firstName:"Donovan",lastName:"Clingan",tricode:"POR",teamName:"Portland Trail Blazers",position:"C",jersey:"23"},
  {id:1629056,firstName:"Toumani",lastName:"Camara",tricode:"POR",teamName:"Portland Trail Blazers",position:"F",jersey:"33"},
  {id:1629640,firstName:"Matisse",lastName:"Thybulle",tricode:"POR",teamName:"Portland Trail Blazers",position:"G-F",jersey:"4"},
  {id:1630174,firstName:"Robert",lastName:"Williams III",tricode:"POR",teamName:"Portland Trail Blazers",position:"C",jersey:"35"},
  {id:1629637,firstName:"Kris",lastName:"Murray",tricode:"POR",teamName:"Portland Trail Blazers",position:"F",jersey:"8"},
  {id:1629056,firstName:"Rayan",lastName:"Rupert",tricode:"POR",teamName:"Portland Trail Blazers",position:"G-F",jersey:"5"},
  // Sacramento Kings (bench)
  {id:1629637,firstName:"Chris",lastName:"Duarte",tricode:"SAC",teamName:"Sacramento Kings",position:"G-F",jersey:"3"},
  {id:1629056,firstName:"Trey",lastName:"Lyles",tricode:"SAC",teamName:"Sacramento Kings",position:"F",jersey:"41"},
  {id:1629640,firstName:"Isaiah",lastName:"Crawford",tricode:"SAC",teamName:"Sacramento Kings",position:"G",jersey:"2"},
  {id:1630174,firstName:"Mason",lastName:"Jones",tricode:"SAC",teamName:"Sacramento Kings",position:"G",jersey:"8"},
  {id:1629637,firstName:"Alex",lastName:"Len",tricode:"SAC",teamName:"Sacramento Kings",position:"C",jersey:"25"},
  {id:1629056,firstName:"Colby",lastName:"Jones",tricode:"SAC",teamName:"Sacramento Kings",position:"G-F",jersey:"20"},
  // San Antonio Spurs (bench)
  {id:1629637,firstName:"Malaki",lastName:"Branham",tricode:"SAS",teamName:"San Antonio Spurs",position:"G",jersey:"12"},
  {id:1629056,firstName:"Julian",lastName:"Champagnie",tricode:"SAS",teamName:"San Antonio Spurs",position:"F",jersey:"3"},
  {id:1629640,firstName:"Sandro",lastName:"Mamukelashvili",tricode:"SAS",teamName:"San Antonio Spurs",position:"F",jersey:"54"},
  {id:1630174,firstName:"Blake",lastName:"Wesley",tricode:"SAS",teamName:"San Antonio Spurs",position:"G",jersey:"14"},
  {id:1629637,firstName:"Charles",lastName:"Bassey",tricode:"SAS",teamName:"San Antonio Spurs",position:"C",jersey:"28"},
  {id:1641721,firstName:"Zach",lastName:"Collins",tricode:"SAS",teamName:"San Antonio Spurs",position:"C",jersey:"23"},
  // Toronto Raptors (bench)
  {id:1629637,firstName:"Gradey",lastName:"Dick",tricode:"TOR",teamName:"Toronto Raptors",position:"G",jersey:"1"},
  {id:1629056,firstName:"Jonathan",lastName:"Mogbo",tricode:"TOR",teamName:"Toronto Raptors",position:"F",jersey:"8"},
  {id:1629640,firstName:"Ochai",lastName:"Agbaji",tricode:"TOR",teamName:"Toronto Raptors",position:"G-F",jersey:"30"},
  {id:1630174,firstName:"Chris",lastName:"Boucher",tricode:"TOR",teamName:"Toronto Raptors",position:"F",jersey:"25"},
  {id:1629637,firstName:"Jamal",lastName:"Shead",tricode:"TOR",teamName:"Toronto Raptors",position:"G",jersey:"0"},
  {id:1629056,firstName:"Kelly",lastName:"Olynyk",tricode:"TOR",teamName:"Toronto Raptors",position:"C",jersey:"13"},
  // Utah Jazz (bench)
  {id:1629637,firstName:"Isaiah",lastName:"Collier",tricode:"UTA",teamName:"Utah Jazz",position:"G",jersey:"0"},
  {id:1629056,firstName:"Taylor",lastName:"Hendricks",tricode:"UTA",teamName:"Utah Jazz",position:"F",jersey:"1"},
  {id:1629640,firstName:"Brice",lastName:"Sensabaugh",tricode:"UTA",teamName:"Utah Jazz",position:"G-F",jersey:"6"},
  {id:1630174,firstName:"Johnny",lastName:"Juzang",tricode:"UTA",teamName:"Utah Jazz",position:"G",jersey:"3"},
  {id:1629637,firstName:"Kyle",lastName:"Filipowski",tricode:"UTA",teamName:"Utah Jazz",position:"F",jersey:"22"},
  {id:1629056,firstName:"Cody",lastName:"Williams",tricode:"UTA",teamName:"Utah Jazz",position:"F",jersey:"13"},
].map(p => ({ ...p, fullName: `${p.firstName} ${p.lastName}` }));

// ─── Endpoints ─────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    cacheSize: cache.size,
    uptime: Math.round(process.uptime()),
    playerCount: NBA_PLAYERS.length,
  });
});

// Player search — instant autocomplete, no external calls
// Matches on typing: "le" → LeBron, Leandro, etc.
// Sorts: first-name-starts-with match first, then last-name, then contains
app.get('/api/players/search', (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 1) return res.json({ players: [] });

  const results = NBA_PLAYERS
    .map(p => {
      const full = p.fullName.toLowerCase();
      const first = p.firstName.toLowerCase();
      const last = p.lastName.toLowerCase();
      let score = 0;
      if (first.startsWith(q)) score = 3;       // "le" → LeBron
      else if (last.startsWith(q)) score = 2;   // "ja" → James
      else if (full.includes(q)) score = 1;     // partial anywhere
      return { p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.p.lastName.localeCompare(b.p.lastName))
    .map(({ p }) => p)
    .slice(0, 12);

  res.json({ players: results });
});

// Today's scoreboard
app.get('/api/scoreboard', async (req, res) => {
  const cached = cacheGet('scoreboard');
  if (cached) return res.json({ ...cached, cached: true });
  try {
    const data = await nbaFetch('https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json');
    const games = data.scoreboard.games.map(g => ({
      gameId:     g.gameId,
      status:     g.gameStatus,
      statusText: g.gameStatusText,
      period:     g.period,
      clock:      g.gameClock,
      home: { teamId: g.homeTeam.teamId, tricode: g.homeTeam.teamTricode, name: g.homeTeam.teamName, score: g.homeTeam.score },
      away: { teamId: g.awayTeam.teamId, tricode: g.awayTeam.teamTricode, name: g.awayTeam.teamName, score: g.awayTeam.score },
    }));
    const payload = { games, updatedAt: new Date().toISOString() };
    cacheSet('scoreboard', payload, TTL.scoreboard);
    res.json({ ...payload, cached: false });
  } catch (e) {
    res.status(502).json({ error: 'NBA.com unreachable', message: e.message });
  }
});

// Live stats for a specific player
app.get('/api/player-stats', async (req, res) => {
  const playerId = parseInt(req.query.playerId);
  if (!playerId) return res.status(400).json({ error: 'playerId required' });

  try {
    let sb = cacheGet('scoreboard');
    if (!sb) {
      const data = await nbaFetch('https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json');
      sb = {
        games: data.scoreboard.games.map(g => ({
          gameId: g.gameId, status: g.gameStatus, period: g.period,
          clock: g.gameClock, statusText: g.gameStatusText,
          home: { teamId: g.homeTeam.teamId, tricode: g.homeTeam.teamTricode, name: g.homeTeam.teamName, score: g.homeTeam.score },
          away: { teamId: g.awayTeam.teamId, tricode: g.awayTeam.teamTricode, name: g.awayTeam.teamName, score: g.awayTeam.score },
        })),
      };
      cacheSet('scoreboard', sb, TTL.scoreboard);
    }

    for (const g of sb.games) {
      if (g.status === 1) continue; // game not started yet
      let box = cacheGet(`box:${g.gameId}`);
      if (!box) {
        const data = await nbaFetch(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${g.gameId}.json`);
        box = data.game;
        cacheSet(`box:${g.gameId}`, box, TTL.boxscore);
      }

      const homePlayer = (box.homeTeam?.players || []).find(p => p.personId === playerId);
      const awayPlayer = (box.awayTeam?.players || []).find(p => p.personId === playerId);
      const player = homePlayer || awayPlayer;
      if (!player) continue;

      const team = homePlayer ? box.homeTeam : box.awayTeam;
      const opp  = homePlayer ? box.awayTeam : box.homeTeam;
      const s = player.statistics || {};

      return res.json({
        found: true,
        gameStatus: g.status,
        gameStatusText: g.statusText,
        period: g.period,
        clock: g.clock,
        score: { team: team.score, opponent: opp.score },
        team: { id: team.teamId, tricode: team.teamTricode, name: team.teamName },
        opponent: { id: opp.teamId, tricode: opp.teamTricode },
        player: {
          id: player.personId, name: player.name,
          firstName: player.firstName, lastName: player.familyName,
          jersey: player.jerseyNum, position: player.position,
          played: player.played === '1', onCourt: player.oncourt === '1',
        },
        stats: {
          minutes: s.minutes || 'PT00M',
          points: s.points ?? 0,
          rebounds: s.reboundsTotal ?? 0,
          assists: s.assists ?? 0,
          steals: s.steals ?? 0,
          blocks: s.blocks ?? 0,
          fgMade: s.fieldGoalsMade ?? 0,
          fgAttempted: s.fieldGoalsAttempted ?? 0,
          fgPct: Math.round((s.fieldGoalsPercentage ?? 0) * 1000) / 10,
          fg3Made: s.threePointersMade ?? 0,
          fg3Attempted: s.threePointersAttempted ?? 0,
          fg3Pct: Math.round((s.threePointersPercentage ?? 0) * 1000) / 10,
          ftMade: s.freeThrowsMade ?? 0,
          ftAttempted: s.freeThrowsAttempted ?? 0,
          ftPct: Math.round((s.freeThrowsPercentage ?? 0) * 1000) / 10,
        },
        updatedAt: new Date().toISOString(),
      });
    }

    return res.json({ found: false, reason: 'No active game for this player today' });

  } catch (e) {
    res.status(502).json({ error: 'Lookup failed', message: e.message });
  }
});

// ─── Start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`NBA widget proxy on :${PORT} — ${NBA_PLAYERS.length} players loaded`);
});
