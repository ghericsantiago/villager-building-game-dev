export const TILE = 32;
export const COLS = 200;
export const ROWS = 180;

export const resourceTypes = [
  {key:'tree', color:'green'},
  {key:'stone', color:'#999'},
  {key:'iron', color:'#664422'},
  {key:'copper', color:'#cc7733'},
  {key:'gold', color:'gold'},
];

export function randInt(a,b){return a+Math.floor(Math.random()*(b-a+1))}
