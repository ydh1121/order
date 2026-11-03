// Gregorian civil dates: no local timezone, DST or Date's special years 0..99.
export const validMonth=(year,month)=>Number.isInteger(year)&&year>=1&&year<=9999&&Number.isInteger(month)&&month>=1&&month<=12;
export const monthDays=(year,month)=>validMonth(year,month)?[31,year%4===0&&(year%100!==0||year%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][month-1]:null;
export function ordinal(year,month,day){const before=year-1;let result=before*365+Math.floor(before/4)-Math.floor(before/100)+Math.floor(before/400)+day;for(let m=1;m<month;m++)result+=monthDays(year,m);return result;}
export const weekday=day=>(day-1)%7+1;
export const isoDate=(year,month,day)=>`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
export function parseDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const [year,month,day]=value.split('-').map(Number);return validMonth(year,month)&&day>=1&&day<=monthDays(year,month)?{year,month,day,ordinal:ordinal(year,month,day)}:null;}
export function dateFromOrdinal(value){if(!Number.isInteger(value)||value<1||value>ordinal(9999,12,31))return null;let low=1,high=9999;while(low<high){const middle=Math.ceil((low+high)/2);if(ordinal(middle,1,1)<=value)low=middle;else high=middle-1;}let month=1;while(month<12&&ordinal(low,month+1,1)<=value)month++;const day=value-ordinal(low,month,1)+1;return isoDate(low,month,day);}
export const addDays=(value,days)=>{const date=parseDate(value);return date&&Number.isInteger(days)?dateFromOrdinal(date.ordinal+days):null;};
export const nextMonth=(year,month)=>month===12?{year:year+1,month:1}:{year,month:month+1};
