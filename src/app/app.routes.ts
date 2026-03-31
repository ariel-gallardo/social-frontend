import { Routes } from '@angular/router';
import { ChatLayout } from './components/chat-layout/chat-layout';
import { ChatArea } from './components/chat-area/chat-area';
import { PeoplePage } from './components/people-page/people-page';
import { SettingsPage } from './components/settings-page/settings-page';
import { Login } from './features/auth/config/login/login';
import { Register } from './features/auth/config/register/register';
import { AuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    { path: '', redirectTo: '/chat', pathMatch: 'full' },
    { path: 'login', component: Login },
    { path: 'register', component: Register },
    {
        path: '',
        component: ChatLayout,
        canActivate: [AuthGuard],
        children: [
            { path: 'chat', component: ChatArea },
            { path: 'chat/:id', component: ChatArea },
            { path: 'people', component: PeoplePage },
            { path: 'settings', component: SettingsPage }
        ]
    },
    { path: '**', redirectTo: '/chat' }
];
