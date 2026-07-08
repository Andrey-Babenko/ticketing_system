import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { CDK_DRAG_CONFIG } from '@angular/cdk/drag-drop';

import { routes } from './app.routes';
import { ApiConfiguration } from './api/api-configuration';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: ApiConfiguration, useValue: { rootUrl: '/api' } },
    // dragStartThreshold: 0 — the drag-overlay must mount on the very first pointer
    // move so the shared E2E helper's activation check (helpers.ts) never flakes.
    { provide: CDK_DRAG_CONFIG, useValue: { dragStartThreshold: 0, pointerDirectionChangeThreshold: 5 } },
  ]
};
