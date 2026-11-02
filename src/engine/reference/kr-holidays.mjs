/* Reviewed official-date snapshot; source notices and data scope are part of the contract. */
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const KR_HOLIDAY_SNAPSHOT=freeze({
  "version": "ORDER-KR-PUBLIC-20261103-v2",
  "retrieved": "2026-11-03",
  "coverage": [
    2026,
    2027
  ],
  "scope": "South Korea nationwide public holidays; not local/company days or delivery commitments",
  "sources": {
    "KASI2026": {
      "url": "https://astro.kasi.re.kr/kor/life/post/calendarData?year=2026",
      "version": "V1.0a / 2024-07-25 16:57; crosschecked 2026-11-03 against KASA, MPM amendments and current law",
      "basis": "KASI annual dates, crosschecked with KASA 2026 almanac and 2026 Labour/Constitution update"
    },
    "KASA2026": {
      "url": "https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=202",
      "version": "2025-06-30 / 2026 almanac announcement",
      "basis": "Official KASA announcement republished by KASI"
    },
    "KASA2027": {
      "url": "https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431",
      "version": "2026-06-29 / 2027 almanac announcement",
      "basis": "Official annual announcement; also confirms Labour and Constitution holidays effective in 2026"
    },
    "KASI2027": {
      "url": "https://astro.kasi.re.kr/kor/life/post/calendarData?year=2027",
      "version": "KASI annual table updated 2026-06-30; rechecked 2026-11-03 KST",
      "basis": "Detailed annual public-holiday dates; source page prepublication disclaimer is retained, not mislabeled as gazette bytes"
    },
    "SPCDE": {
      "url": "https://www.data.go.kr/data/15012690/openapi.do",
      "version": "Special-day service metadata inspected 2026-10-29; authenticated API NOT_CALLED",
      "basis": "National/public-holiday/anniversary classification and isHoliday semantics; no API key acquired or embedded"
    },
    "LAW2026": {
      "url": "https://law.go.kr/lsLinkCommonInfo.do?lspttninfSeq=172595",
      "version": "Presidential Decree 36290 / effective 2026-05-11",
      "basis": "Article3 current substitute holiday conditions; no substitute inferred for Memorial Day."
    },
    "MPM2026": {
      "url": "https://www.mpm.go.kr/mpm/comm/newsPress/newsPressRelease/?boardId=bbs_0000000000000029&cntId=4250&mode=view",
      "version": "2026-04-29",
      "basis": "Labour Day and Constitution Day added in 2026, with substitute holidays."
    },
    "NEC2026": {
      "url": "https://si.nec.go.kr/",
      "version": "9th nationwide local elections 2026-06-03",
      "basis": "Confirmed nationwide election date; early-voting dates not holidays."
    },
    "MPM_NOTICES": {
      "url": "https://www.mpm.go.kr/mpm/comm/newsPress/newsPressRelease/?mode=list&searchCondition=title&searchKeyword=%EA%B3%B5%ED%9C%B4%EC%9D%BC",
      "version": "verified 2026-11-03 KST",
      "basis": "Notice search found no additional confirmed 2026 temporary day; absence of search results is not a future guarantee."
    }
  },
  "records": [
    {
      "date": "2026-01-01",
      "name": "1월 1일",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-02-16",
      "name": "설날 연휴",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-02-17",
      "name": "설날",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-02-18",
      "name": "설날 연휴",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-03-01",
      "name": "3·1절",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-03-02",
      "name": "대체공휴일(3·1절)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-05-01",
      "name": "노동절",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASA2027",
        "MPM2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-05-05",
      "name": "어린이날",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-05-24",
      "name": "부처님오신날",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-05-25",
      "name": "대체공휴일(부처님오신날)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-06-03",
      "name": "전국동시지방선거",
      "type": "election",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026",
        "NEC2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-06-06",
      "name": "현충일",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-07-17",
      "name": "제헌절",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASA2027",
        "MPM2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-08-15",
      "name": "광복절",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-08-17",
      "name": "대체공휴일(광복절)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-09-24",
      "name": "추석 연휴",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-09-25",
      "name": "추석",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-09-26",
      "name": "추석 연휴",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-10-03",
      "name": "개천절",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-10-05",
      "name": "대체공휴일(개천절)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-10-09",
      "name": "한글날",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2026-12-25",
      "name": "기독탄신일",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2026",
        "KASA2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2026"
    },
    {
      "date": "2027-01-01",
      "name": "1월 1일",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-02-06",
      "name": "설날 연휴",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-02-07",
      "name": "설날",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-02-08",
      "name": "설날 연휴",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-02-09",
      "name": "대체공휴일(설날)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-03-01",
      "name": "3·1절",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-05-01",
      "name": "노동절",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027",
        "MPM2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-05-03",
      "name": "대체공휴일(노동절)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-05-05",
      "name": "어린이날",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-05-13",
      "name": "부처님오신날",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-06-06",
      "name": "현충일",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-07-17",
      "name": "제헌절",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027",
        "MPM2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-07-19",
      "name": "대체공휴일(제헌절)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-08-15",
      "name": "광복절",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-08-16",
      "name": "대체공휴일(광복절)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-09-14",
      "name": "추석 연휴",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-09-15",
      "name": "추석",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-09-16",
      "name": "추석 연휴",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-10-03",
      "name": "개천절",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-10-04",
      "name": "대체공휴일(개천절)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-10-09",
      "name": "한글날",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-10-11",
      "name": "대체공휴일(한글날)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-12-25",
      "name": "기독탄신일",
      "type": "public-holiday",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    },
    {
      "date": "2027-12-27",
      "name": "대체공휴일(기독탄신일)",
      "type": "substitute",
      "isHoliday": true,
      "sources": [
        "KASI2027",
        "KASA2027",
        "LAW2026"
      ],
      "version": "ORDER-KR-PUBLIC-20261103-v2",
      "coverage": "2027"
    }
  ],
  "limitations": [
    "Static review snapshot; no authenticated special-day API was called.",
    "KASI detailed annual tables are checked against published KASA notices; publication disclaimers are not erased.",
    "Later extraordinary holidays, annual updates and years outside 2026/2027 require fresh data.",
    "No weekday-based substitute-day inference; June 7 2027 is not fabricated as a holiday.",
    "2028 is not covered. A 2027-December start range cannot claim a verified 2028-January upper bound. No default nationwide year-end closure or congestion warning is applied."
  ],
  "verifiedAt": "2026-11-02T15:16:42.255741Z",
  "status": "verified",
  "expiresAt": null,
  "priorVersion": "ORDER-KR-PUBLIC-20261029-v1",
  "coverageStart": "2026-01-01",
  "coverageEnd": "2027-12-31",
  "refreshOwner": "ASTRA_ENGINE_EXECUTION: verify annual KASA almanac, amended law and confirmed temporary/election notices before replacing this version; no online auto-update is claimed.",
  "dataHash": "sha256:98a458ea2c82cb0e778c72d4297e7d7f03df78b409548505ffe000812f061687"
});
export const OrderHolidaySnapshot=Object.freeze({metadata:KR_HOLIDAY_SNAPSHOT,get(year,month,day){const key=String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');return {covered:KR_HOLIDAY_SNAPSHOT.coverage.includes(Number(year)),record:KR_HOLIDAY_SNAPSHOT.records.find(record=>record.date===key)||null};}});
