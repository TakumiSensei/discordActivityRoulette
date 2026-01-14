import { RouletteGame } from './game/RouletteGame.js';
import './style.css';
// Entry point
document.addEventListener('DOMContentLoaded', () => {
    const game = new RouletteGame();
    game.start();
});
