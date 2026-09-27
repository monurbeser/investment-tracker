/**
 * Core scan universe of the US signal platform: liquid common stocks listed on
 * NASDAQ, NYSE and NYSE American (large, mid and popular small caps across all
 * sectors). At scan time it is extended with the stocks Yahoo's US screeners
 * currently list as most active / top gainers / top losers on any US exchange.
 * Names and exchanges are refreshed from the data source when available.
 */

export interface UniverseStock {
  symbol: string;
  name: string;
  exchange: string;
  sector: string;
}

export const SECTORS: Record<string, string> = {
  T: "Teknoloji",
  C: "İletişim",
  D: "Tüketici (Döngüsel)",
  S: "Tüketici (Temel)",
  H: "Sağlık",
  F: "Finans",
  I: "Sanayi",
  E: "Enerji",
  M: "Malzeme",
  R: "Gayrimenkul",
  U: "Kamu Hizmetleri",
};

// symbol|name|exchange (Q = NASDAQ, N = NYSE, A = NYSE American)|sector
const RAW = `
AAPL|Apple Inc.|Q|T
MSFT|Microsoft Corporation|Q|T
NVDA|NVIDIA Corporation|Q|T
AVGO|Broadcom Inc.|Q|T
ORCL|Oracle Corporation|N|T
CRM|Salesforce, Inc.|N|T
ADBE|Adobe Inc.|Q|T
AMD|Advanced Micro Devices, Inc.|Q|T
INTC|Intel Corporation|Q|T
CSCO|Cisco Systems, Inc.|Q|T
IBM|International Business Machines|N|T
QCOM|QUALCOMM Incorporated|Q|T
TXN|Texas Instruments Incorporated|Q|T
MU|Micron Technology, Inc.|Q|T
AMAT|Applied Materials, Inc.|Q|T
LRCX|Lam Research Corporation|Q|T
KLAC|KLA Corporation|Q|T
ADI|Analog Devices, Inc.|Q|T
MRVL|Marvell Technology, Inc.|Q|T
NXPI|NXP Semiconductors N.V.|Q|T
MCHP|Microchip Technology Incorporated|Q|T
ON|ON Semiconductor Corporation|Q|T
ARM|Arm Holdings plc|Q|T
SMCI|Super Micro Computer, Inc.|Q|T
DELL|Dell Technologies Inc.|N|T
HPQ|HP Inc.|N|T
HPE|Hewlett Packard Enterprise|N|T
ANET|Arista Networks, Inc.|N|T
NOW|ServiceNow, Inc.|N|T
INTU|Intuit Inc.|Q|T
PANW|Palo Alto Networks, Inc.|Q|T
CRWD|CrowdStrike Holdings, Inc.|Q|T
FTNT|Fortinet, Inc.|Q|T
ZS|Zscaler, Inc.|Q|T
NET|Cloudflare, Inc.|N|T
DDOG|Datadog, Inc.|Q|T
SNOW|Snowflake Inc.|N|T
MDB|MongoDB, Inc.|Q|T
PLTR|Palantir Technologies Inc.|Q|T
WDAY|Workday, Inc.|Q|T
ADSK|Autodesk, Inc.|Q|T
CDNS|Cadence Design Systems, Inc.|Q|T
SNPS|Synopsys, Inc.|Q|T
TEAM|Atlassian Corporation|Q|T
SHOP|Shopify Inc.|Q|T
UBER|Uber Technologies, Inc.|N|T
APP|AppLovin Corporation|Q|T
MSTR|Strategy Inc|Q|T
COIN|Coinbase Global, Inc.|Q|F
HOOD|Robinhood Markets, Inc.|Q|F
XYZ|Block, Inc.|N|F
PYPL|PayPal Holdings, Inc.|Q|F
AFRM|Affirm Holdings, Inc.|Q|F
SOFI|SoFi Technologies, Inc.|Q|F
U|Unity Software Inc.|N|T
PATH|UiPath Inc.|N|T
AI|C3.ai, Inc.|N|T
IONQ|IonQ, Inc.|N|T
RGTI|Rigetti Computing, Inc.|Q|T
SOUN|SoundHound AI, Inc.|Q|T
TSM|Taiwan Semiconductor (ADR)|N|T
ASML|ASML Holding N.V. (ADR)|Q|T
WDC|Western Digital Corporation|Q|T
STX|Seagate Technology Holdings|Q|T
GLW|Corning Incorporated|N|T
TEL|TE Connectivity Ltd.|N|T
APH|Amphenol Corporation|N|T
ACN|Accenture plc|N|T
IT|Gartner, Inc.|N|T
CTSH|Cognizant Technology Solutions|Q|T
FICO|Fair Isaac Corporation|N|T
ROP|Roper Technologies, Inc.|Q|T
VRT|Vertiv Holdings Co|N|I
CIEN|Ciena Corporation|N|T
CRDO|Credo Technology Group|Q|T
ALAB|Astera Labs, Inc.|Q|T
TTD|The Trade Desk, Inc.|Q|C
GOOGL|Alphabet Inc. (Class A)|Q|C
GOOG|Alphabet Inc. (Class C)|Q|C
META|Meta Platforms, Inc.|Q|C
NFLX|Netflix, Inc.|Q|C
DIS|The Walt Disney Company|N|C
CMCSA|Comcast Corporation|Q|C
T|AT&T Inc.|N|C
VZ|Verizon Communications Inc.|N|C
TMUS|T-Mobile US, Inc.|Q|C
CHTR|Charter Communications, Inc.|Q|C
WBD|Warner Bros. Discovery, Inc.|Q|C
EA|Electronic Arts Inc.|Q|C
TTWO|Take-Two Interactive Software|Q|C
RBLX|Roblox Corporation|N|C
SNAP|Snap Inc.|N|C
PINS|Pinterest, Inc.|N|C
SPOT|Spotify Technology S.A.|N|C
RDDT|Reddit, Inc.|N|C
ROKU|Roku, Inc.|Q|C
AMZN|Amazon.com, Inc.|Q|D
TSLA|Tesla, Inc.|Q|D
HD|The Home Depot, Inc.|N|D
LOW|Lowe's Companies, Inc.|N|D
MCD|McDonald's Corporation|N|D
SBUX|Starbucks Corporation|Q|D
NKE|NIKE, Inc.|N|D
BKNG|Booking Holdings Inc.|Q|D
ABNB|Airbnb, Inc.|Q|D
MAR|Marriott International, Inc.|Q|D
HLT|Hilton Worldwide Holdings Inc.|N|D
TJX|The TJX Companies, Inc.|N|D
ROST|Ross Stores, Inc.|Q|D
CMG|Chipotle Mexican Grill, Inc.|N|D
ORLY|O'Reilly Automotive, Inc.|Q|D
AZO|AutoZone, Inc.|N|D
GM|General Motors Company|N|D
F|Ford Motor Company|N|D
RIVN|Rivian Automotive, Inc.|Q|D
LCID|Lucid Group, Inc.|Q|D
LULU|Lululemon Athletica Inc.|Q|D
DECK|Deckers Outdoor Corporation|N|D
ULTA|Ulta Beauty, Inc.|Q|D
EBAY|eBay Inc.|Q|D
ETSY|Etsy, Inc.|Q|D
DASH|DoorDash, Inc.|Q|D
CVNA|Carvana Co.|N|D
RCL|Royal Caribbean Cruises Ltd.|N|D
CCL|Carnival Corporation & plc|N|D
NCLH|Norwegian Cruise Line Holdings|N|D
EXPE|Expedia Group, Inc.|Q|D
YUM|Yum! Brands, Inc.|N|D
DPZ|Domino's Pizza, Inc.|Q|D
DKNG|DraftKings Inc.|Q|D
LVS|Las Vegas Sands Corp.|N|D
WYNN|Wynn Resorts, Limited|Q|D
BBY|Best Buy Co., Inc.|N|D
TGT|Target Corporation|N|S
WMT|Walmart Inc.|N|S
COST|Costco Wholesale Corporation|Q|S
PG|The Procter & Gamble Company|N|S
KO|The Coca-Cola Company|N|S
PEP|PepsiCo, Inc.|Q|S
PM|Philip Morris International Inc.|N|S
MO|Altria Group, Inc.|N|S
MDLZ|Mondelez International, Inc.|Q|S
CL|Colgate-Palmolive Company|N|S
KMB|Kimberly-Clark Corporation|N|S
GIS|General Mills, Inc.|N|S
KHC|The Kraft Heinz Company|Q|S
HSY|The Hershey Company|N|S
STZ|Constellation Brands, Inc.|N|S
MNST|Monster Beverage Corporation|Q|S
KDP|Keurig Dr Pepper Inc.|Q|S
EL|The Estée Lauder Companies Inc.|N|S
KR|The Kroger Co.|N|S
DG|Dollar General Corporation|N|S
DLTR|Dollar Tree, Inc.|Q|S
CELH|Celsius Holdings, Inc.|Q|S
ELF|e.l.f. Beauty, Inc.|N|S
LLY|Eli Lilly and Company|N|H
UNH|UnitedHealth Group Incorporated|N|H
JNJ|Johnson & Johnson|N|H
ABBV|AbbVie Inc.|N|H
MRK|Merck & Co., Inc.|N|H
PFE|Pfizer Inc.|N|H
TMO|Thermo Fisher Scientific Inc.|N|H
ABT|Abbott Laboratories|N|H
DHR|Danaher Corporation|N|H
AMGN|Amgen Inc.|Q|H
GILD|Gilead Sciences, Inc.|Q|H
BMY|Bristol-Myers Squibb Company|N|H
VRTX|Vertex Pharmaceuticals Incorporated|Q|H
REGN|Regeneron Pharmaceuticals, Inc.|Q|H
ISRG|Intuitive Surgical, Inc.|Q|H
MDT|Medtronic plc|N|H
SYK|Stryker Corporation|N|H
BSX|Boston Scientific Corporation|N|H
EW|Edwards Lifesciences Corporation|N|H
ZTS|Zoetis Inc.|N|H
CVS|CVS Health Corporation|N|H
CI|The Cigna Group|N|H
ELV|Elevance Health, Inc.|N|H
HUM|Humana Inc.|N|H
HCA|HCA Healthcare, Inc.|N|H
MRNA|Moderna, Inc.|Q|H
BIIB|Biogen Inc.|Q|H
DXCM|DexCom, Inc.|Q|H
IDXX|IDEXX Laboratories, Inc.|Q|H
IQV|IQVIA Holdings Inc.|N|H
HIMS|Hims & Hers Health, Inc.|N|H
NVO|Novo Nordisk A/S (ADR)|N|H
TEM|Tempus AI, Inc.|Q|H
JPM|JPMorgan Chase & Co.|N|F
BAC|Bank of America Corporation|N|F
WFC|Wells Fargo & Company|N|F
C|Citigroup Inc.|N|F
GS|The Goldman Sachs Group, Inc.|N|F
MS|Morgan Stanley|N|F
SCHW|The Charles Schwab Corporation|N|F
BLK|BlackRock, Inc.|N|F
BX|Blackstone Inc.|N|F
KKR|KKR & Co. Inc.|N|F
APO|Apollo Global Management, Inc.|N|F
AXP|American Express Company|N|F
V|Visa Inc.|N|F
MA|Mastercard Incorporated|N|F
COF|Capital One Financial Corporation|N|F
USB|U.S. Bancorp|N|F
PNC|The PNC Financial Services Group|N|F
TFC|Truist Financial Corporation|N|F
BRK-B|Berkshire Hathaway Inc. (Class B)|N|F
CB|Chubb Limited|N|F
PGR|The Progressive Corporation|N|F
TRV|The Travelers Companies, Inc.|N|F
AIG|American International Group|N|F
MET|MetLife, Inc.|N|F
PRU|Prudential Financial, Inc.|N|F
MMC|Marsh & McLennan Companies|N|F
AON|Aon plc|N|F
SPGI|S&P Global Inc.|N|F
MCO|Moody's Corporation|N|F
ICE|Intercontinental Exchange, Inc.|N|F
CME|CME Group Inc.|Q|F
NDAQ|Nasdaq, Inc.|Q|F
CBOE|Cboe Global Markets, Inc.|A|F
IBKR|Interactive Brokers Group, Inc.|Q|F
ALLY|Ally Financial Inc.|N|F
SYF|Synchrony Financial|N|F
FIS|Fidelity National Information Services|N|F
GPN|Global Payments Inc.|N|F
XOM|Exxon Mobil Corporation|N|E
CVX|Chevron Corporation|N|E
COP|ConocoPhillips|N|E
EOG|EOG Resources, Inc.|N|E
SLB|Schlumberger Limited|N|E
OXY|Occidental Petroleum Corporation|N|E
PSX|Phillips 66|N|E
MPC|Marathon Petroleum Corporation|N|E
VLO|Valero Energy Corporation|N|E
HAL|Halliburton Company|N|E
DVN|Devon Energy Corporation|N|E
FANG|Diamondback Energy, Inc.|Q|E
KMI|Kinder Morgan, Inc.|N|E
WMB|The Williams Companies, Inc.|N|E
OKE|ONEOK, Inc.|N|E
EQT|EQT Corporation|N|E
CEG|Constellation Energy Corporation|Q|U
VST|Vistra Corp.|N|U
NEE|NextEra Energy, Inc.|N|U
DUK|Duke Energy Corporation|N|U
SO|The Southern Company|N|U
D|Dominion Energy, Inc.|N|U
AEP|American Electric Power Company|Q|U
EXC|Exelon Corporation|Q|U
SRE|Sempra|N|U
XEL|Xcel Energy Inc.|Q|U
PCG|PG&E Corporation|N|U
NRG|NRG Energy, Inc.|N|U
OKLO|Oklo Inc.|N|U
SMR|NuScale Power Corporation|N|I
CCJ|Cameco Corporation|N|E
FSLR|First Solar, Inc.|Q|T
ENPH|Enphase Energy, Inc.|Q|T
PLUG|Plug Power Inc.|Q|I
CAT|Caterpillar Inc.|N|I
DE|Deere & Company|N|I
GE|GE Aerospace|N|I
GEV|GE Vernova Inc.|N|I
HON|Honeywell International Inc.|Q|I
RTX|RTX Corporation|N|I
LMT|Lockheed Martin Corporation|N|I
NOC|Northrop Grumman Corporation|N|I
GD|General Dynamics Corporation|N|I
BA|The Boeing Company|N|I
UPS|United Parcel Service, Inc.|N|I
FDX|FedEx Corporation|N|I
UNP|Union Pacific Corporation|N|I
CSX|CSX Corporation|Q|I
NSC|Norfolk Southern Corporation|N|I
DAL|Delta Air Lines, Inc.|N|I
UAL|United Airlines Holdings, Inc.|Q|I
AAL|American Airlines Group Inc.|Q|I
LUV|Southwest Airlines Co.|N|I
MMM|3M Company|N|I
ETN|Eaton Corporation plc|N|I
EMR|Emerson Electric Co.|N|I
ITW|Illinois Tool Works Inc.|N|I
PH|Parker-Hannifin Corporation|N|I
ROK|Rockwell Automation, Inc.|N|I
WM|Waste Management, Inc.|N|I
RSG|Republic Services, Inc.|N|I
URI|United Rentals, Inc.|N|I
PWR|Quanta Services, Inc.|N|I
CARR|Carrier Global Corporation|N|I
TT|Trane Technologies plc|N|I
JCI|Johnson Controls International|N|I
LHX|L3Harris Technologies, Inc.|N|I
AXON|Axon Enterprise, Inc.|Q|I
TDG|TransDigm Group Incorporated|N|I
HWM|Howmet Aerospace Inc.|N|I
RKLB|Rocket Lab Corporation|Q|I
ACHR|Archer Aviation Inc.|N|I
JOBY|Joby Aviation, Inc.|N|I
ODFL|Old Dominion Freight Line, Inc.|Q|I
CTAS|Cintas Corporation|Q|I
PAYX|Paychex, Inc.|Q|I
ADP|Automatic Data Processing, Inc.|Q|I
FAST|Fastenal Company|Q|I
LIN|Linde plc|Q|M
SHW|The Sherwin-Williams Company|N|M
APD|Air Products and Chemicals, Inc.|N|M
ECL|Ecolab Inc.|N|M
FCX|Freeport-McMoRan Inc.|N|M
NEM|Newmont Corporation|N|M
NUE|Nucor Corporation|N|M
DOW|Dow Inc.|N|M
DD|DuPont de Nemours, Inc.|N|M
ALB|Albemarle Corporation|N|M
MP|MP Materials Corp.|N|M
CLF|Cleveland-Cliffs Inc.|N|M
AA|Alcoa Corporation|N|M
VMC|Vulcan Materials Company|N|M
MLM|Martin Marietta Materials, Inc.|N|M
B|Barrick Mining Corporation|N|M
UEC|Uranium Energy Corp.|A|E
PLD|Prologis, Inc.|N|R
AMT|American Tower Corporation|N|R
EQIX|Equinix, Inc.|Q|R
CCI|Crown Castle Inc.|N|R
PSA|Public Storage|N|R
O|Realty Income Corporation|N|R
SPG|Simon Property Group, Inc.|N|R
WELL|Welltower Inc.|N|R
DLR|Digital Realty Trust, Inc.|N|R
VICI|VICI Properties Inc.|N|R
`;

const EXCHANGES: Record<string, string> = { Q: "NASDAQ", N: "NYSE", A: "NYSE American" };

export const UNIVERSE: UniverseStock[] = RAW.trim()
  .split("\n")
  .map((line) => {
    const [symbol, name, ex, sec] = line.split("|");
    return { symbol, name, exchange: EXCHANGES[ex] ?? ex, sector: SECTORS[sec] ?? sec };
  });

/** Market benchmarks shown in the regime strip (ETFs, not ranked). */
export const BENCHMARKS: UniverseStock[] = [
  { symbol: "SPY", name: "SPDR S&P 500 ETF", exchange: "NYSE Arca", sector: "Endeks" },
  { symbol: "QQQ", name: "Invesco QQQ (Nasdaq-100)", exchange: "NASDAQ", sector: "Endeks" },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF", exchange: "NYSE Arca", sector: "Endeks" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", exchange: "NYSE Arca", sector: "Endeks" },
];

/** Yahoo exchange codes of US venues. */
export const US_EXCHANGES: Record<string, string> = {
  NMS: "NASDAQ",
  NGM: "NASDAQ",
  NCM: "NASDAQ",
  NAS: "NASDAQ",
  NASDAQ: "NASDAQ",
  NYQ: "NYSE",
  NYS: "NYSE",
  NYSE: "NYSE",
  ASE: "NYSE American",
  AMEX: "NYSE American",
  PCX: "NYSE Arca",
  ARCA: "NYSE Arca",
  BTS: "Cboe BZX",
  BATS: "Cboe BZX",
  CXI: "Cboe",
};

export function usExchangeName(code: string | undefined, full?: string): string | null {
  if (code && US_EXCHANGES[code]) return US_EXCHANGES[code];
  if (full) {
    const f = full.toUpperCase();
    if (f.includes("NASDAQ")) return "NASDAQ";
    if (f.includes("ARCA")) return "NYSE Arca";
    if (f.includes("AMERICAN") || f.includes("AMEX")) return "NYSE American";
    if (f.includes("NYSE")) return "NYSE";
    if (f.includes("CBOE") || f.includes("BATS")) return "Cboe BZX";
  }
  return null;
}

/** TradingView symbol for the embedded chart widget. */
export function tradingViewSymbol(symbol: string, exchange: string): string {
  const prefix: Record<string, string> = { NASDAQ: "NASDAQ", NYSE: "NYSE", "NYSE American": "AMEX", "NYSE Arca": "AMEX", "Cboe BZX": "CBOE", Cboe: "CBOE" };
  const tv = symbol.replace("-", ".");
  return prefix[exchange] ? `${prefix[exchange]}:${tv}` : tv;
}

export const isValidUsSymbol = (s: string) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s);
