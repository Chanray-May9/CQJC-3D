// 单个战斗员持有的武器运行时状态：弹药、射速门控、换弹。
// 时间参数 now/单位为秒，由调用方传入（游戏时钟），本类不读取真实时间，便于测试。
export class WeaponRuntime {
  constructor(weapon) {
    this.weapon = weapon;
    this.ammo = weapon.magSize;
    this.reloading = false;
    this._nextFireAt = 0;      // 早于此时间不能开火
    this._reloadDoneAt = 0;
  }

  // 尝试开火：满足冷却、有弹、未换弹则消耗一发并返回 true。
  tryFire(now) {
    if (this.reloading || this.ammo <= 0 || now < this._nextFireAt) return false;
    this.ammo -= 1;
    this._nextFireAt = now + this.weapon.fireInterval;
    return true;
  }

  // 开始换弹。满弹或已在换弹则无操作。
  reload(now) {
    if (this.reloading || this.ammo >= this.weapon.magSize) return;
    this.reloading = true;
    this._reloadDoneAt = now + this.weapon.reloadTime;
  }

  // 推进时钟：换弹到点则回满。
  update(now) {
    if (this.reloading && now >= this._reloadDoneAt) {
      this.reloading = false;
      this.ammo = this.weapon.magSize;
    }
  }
}
