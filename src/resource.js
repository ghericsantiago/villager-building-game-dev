export class ResourceTile{
  constructor(x,y,type,amount){this.x=x;this.y=y;this.type=type;this.amount=amount}
  get screenX(){return this.x}
  get screenY(){return this.y}
}
