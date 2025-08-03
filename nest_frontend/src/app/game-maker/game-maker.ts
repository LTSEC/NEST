import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Game {
  id: number;
  name: string;
  description: string;
  type: string[];
  date: string;
}

@Component({
  selector: 'app-games',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './game-maker.html',
  styleUrls: ['./game-maker.scss']
})
export class GameMaker {
  games: Game[] = [];
  newGame: Game = { id: 0, name: '', description: '', type: [], date: '' };
  editMode = false;
  selectedGameIndex = -1;

  addOrUpdateGame() {
    if (this.editMode && this.selectedGameIndex > -1) {
      this.games[this.selectedGameIndex] = { ...this.newGame };
    } else {
      this.games.push({ ...this.newGame, id: Date.now() });
    }
    this.resetForm();
  }

  editGame(i: number) {
    this.newGame = { ...this.games[i] };
    this.editMode = true;
    this.selectedGameIndex = i;
  }

  deleteGame(i: number) {
    this.games.splice(i, 1);
    if (this.selectedGameIndex === i) this.resetForm();
    else if (this.selectedGameIndex > i) this.selectedGameIndex--;
  }

  toggleType(option: string) {
    const idx = this.newGame.type.indexOf(option);
    idx > -1 ? this.newGame.type.splice(idx, 1) : this.newGame.type.push(option);
  }

  cancelEdit() {
    this.resetForm();
  }

  private resetForm() {
    this.newGame = { id: 0, name: '', description: '', type: [], date: '' };
    this.editMode = false;
    this.selectedGameIndex = -1;
  }
}
