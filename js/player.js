// 試聴の再生。曲が終わったら次の曲へ進む。
import { TEST } from './ui.js';
import { blobUrl } from './store.js';

class Player {
  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.muted = TEST; // テスト時は音を出さない
    this.track = null;
    this.playlist = [];
    this.playing = false;
    this.seeking = false;
    this.onState = () => {};
    this.onTime = () => {};
    this.audio.addEventListener('ended', () => this.next());
    this.audio.addEventListener('timeupdate', () => { if (!this.seeking) this.onTime(); });
    this.audio.addEventListener('loadedmetadata', () => this.onTime());
  }

  get time() { return this.audio.currentTime || 0; }
  get duration() { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0; }

  toggle(track, playlist) {
    if (playlist) this.playlist = playlist;
    if (this.track?.id === track.id) {
      this.playing ? this.pause() : this.resume();
      return;
    }
    this.play(track);
  }

  play(track) {
    const url = blobUrl(track.blobId);
    if (!url) return;
    this.track = track;
    this.audio.src = url;
    this.audio.play().catch(() => {});
    this.playing = true;
    this.onState();
  }

  pause() {
    this.audio.pause();
    this.playing = false;
    this.onState();
  }

  resume() {
    this.audio.play().catch(() => {});
    this.playing = true;
    this.onState();
  }

  index() { return this.playlist.findIndex(t => t.id === this.track?.id); }

  next() {
    const i = this.index();
    if (i >= 0 && i + 1 < this.playlist.length) this.play(this.playlist[i + 1]);
    else this.stop();
  }

  prev() {
    if (this.time > 3) { this.seek(0); return; }
    const i = this.index();
    if (i > 0) this.play(this.playlist[i - 1]);
    else { this.seek(0); if (!this.playing) this.resume(); }
  }

  stop() {
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.track = null;
    this.playing = false;
    this.onState();
  }

  seek(t) {
    this.audio.currentTime = t;
    this.onTime();
  }
}

export const player = new Player();

export function fmtSec(t) {
  const s = Number.isFinite(t) ? Math.floor(t) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
