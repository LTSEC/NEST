import { Routes } from '@angular/router';
import { Login } from './login/login';
import { Dashboard } from './dashboard/dashboard';
import { Shell } from './shell/shell';
import { Games } from './games/games';
import { DevDashboard } from './dev-dashboard/dev-dashboard';
import { GameMaker } from './game-maker/game-maker';
import { GameEditor } from './game-editor/game-editor';

export const routes: Routes = [
    {
        path: 'login',
        component: Login
    },

    {
        path: '',
        component: Shell,
        children: [
            { path: 'dashboard',        component: Dashboard},
            { path: 'dev-dashboard',    component: DevDashboard},

            { path: 'games',            component: Games },
            { path: 'game-maker',       component: GameMaker},
            { path: 'games/:id/edit',   component: GameEditor},
            { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
        ]
    },

    { path: '**', redirectTo: 'login'}
];