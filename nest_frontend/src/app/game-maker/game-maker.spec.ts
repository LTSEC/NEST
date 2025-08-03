import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GameMaker } from './game-maker';

describe('GameMaker', () => {
  let component: GameMaker;
  let fixture: ComponentFixture<GameMaker>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameMaker]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GameMaker);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
