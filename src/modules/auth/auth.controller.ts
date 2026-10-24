import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';

export async function registerHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await AuthService.register(req.body);
    return res.status(201).json({
      message: 'Usuario registrado exitosamente.',
      data: user,
    });
  } catch (error: any) {
    return res.status(400).json({
      error: 'Bad Request',
      message: error.message || 'Error al registrar el usuario.',
    });
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await AuthService.login(req.body);
    return res.status(200).json({
      message: 'Inicio de sesión exitoso.',
      data: result,
    });
  } catch (error: any) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: error.message || 'Credenciales inválidas.',
    });
  }
}

export async function meHandler(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No autenticado.',
      });
    }

    const userProfile = await AuthService.getProfile(req.user.userId);
    return res.status(200).json({
      message: 'Perfil obtenido exitosamente.',
      data: userProfile,
    });
  } catch (error: any) {
    return res.status(400).json({
      error: 'Bad Request',
      message: error.message || 'Error al obtener el perfil.',
    });
  }
}