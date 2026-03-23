export class BaseObject {
  constructor(props = {}) {
    this.id = props.id ?? null;
    this.kind = props.kind || props.type || '';
    this.type = props.type || props.kind || '';
    this.name = props.name || this.kind || this.type || '';
    this.icon = props.icon || '';
    this.sprite = props.sprite || '';
    this.spriteScale = Number.isFinite(props.spriteScale)
      ? Math.max(0.1, Number(props.spriteScale))
      : 1;
  }

  hasSprite() {
    return !!this.sprite;
  }

  setSprite(sprite, spriteScale = null) {
    this.sprite = sprite || '';
    if (Number.isFinite(spriteScale)) {
      this.spriteScale = Math.max(0.1, Number(spriteScale));
    }
  }
}
