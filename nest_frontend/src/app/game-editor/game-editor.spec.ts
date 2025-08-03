import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GameEditor } from './game-editor';

describe('GameEditor', () => {
  let component: GameEditor;
  let fixture: ComponentFixture<GameEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameEditor]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GameEditor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
