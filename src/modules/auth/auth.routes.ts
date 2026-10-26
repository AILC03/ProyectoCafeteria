import { Router } from 'express';
import type { AuthService } from './auth.service.js';
import { authController } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { csrf } from '../../middleware/csrf.js';

export function authRoutes(service: AuthService) {
  const router = Router(),
    controller = authController(service),
    protect = csrf(service);
  router.use((_request, response, next) => {
    response.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/csrf', controller.bootstrap);
  router.post('/login/staff', protect, controller.loginStaff);
  router.post('/login/customer', protect, controller.loginCustomer);
  router.post('/refresh', protect, controller.refresh);
  router.post('/logout', protect, controller.logout);
  router.get('/me', authenticate(service), controller.me);
  router.patch('/pin', protect, authenticate(service, true), controller.changePin);
  router.patch('/password', protect, authenticate(service), controller.changePassword);
  return router;
}
