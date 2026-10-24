import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { createDatabase } from '../../config/database.js';

const db = createDatabase(process.env.DIRECT_URL || process.env.DATABASE_URL || '');
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_desarrollo_cafeteria';

export interface RegisterUserDto {
  name: string;
  username?: string;
  recoveryEmail?: string;
  password?: string;
  phone?: string;
  accountType?: 'CUSTOMER' | 'STAFF';
}

export interface LoginUserDto {
  usernameOrEmail: string;
  password?: string;
}

export class AuthService {
  static async register(dto: RegisterUserDto) {
    const { name, username, recoveryEmail, password, phone, accountType = 'CUSTOMER' } = dto;

    if (!username && !recoveryEmail) {
      throw new Error('Debes proporcionar un username o un correo de recuperación (recoveryEmail).');
    }

    if (!password) {
      throw new Error('La contraseña es requerida.');
    }

    if (username) {
      const existingUsername = await db.user.findUnique({ where: { username } });
      if (existingUsername) {
        throw new Error('El nombre de usuario ya se encuentra registrado.');
      }
    }

    if (recoveryEmail) {
      const existingEmail = await db.user.findFirst({ where: { recoveryEmail } });
      if (existingEmail) {
        throw new Error('El correo electrónico ya se encuentra registrado.');
      }
    }

    let defaultRole = await db.role.findFirst({
      where: { name: { equals: 'CLIENTE', mode: 'insensitive' } },
    });

    if (!defaultRole) {
      defaultRole = await db.role.findFirst();
    }

    if (!defaultRole) {
      throw new Error('No existen roles configurados en la base de datos.');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await db.user.create({
      data: {
        name,
        username: username || null,
        recoveryEmail: recoveryEmail || null,
        passwordHash,
        phone: phone || null,
        accountType: accountType as any,
        roleId: defaultRole.id,
      },
      include: {
        role: true,
      },
    });

    const { passwordHash: _, pinHash: __, ...userWithoutSecrets } = newUser;

    return userWithoutSecrets;
  }

  static async login(dto: LoginUserDto) {
    const { usernameOrEmail, password } = dto;

    if (!usernameOrEmail || !password) {
      throw new Error('El usuario/correo y la contraseña son requeridos.');
    }

    const user = await db.user.findFirst({
      where: {
        OR: [
          { username: usernameOrEmail },
          { recoveryEmail: usernameOrEmail },
        ],
      },
      include: {
        role: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new Error('Credenciales inválidas.');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Credenciales inválidas.');
    }

    const token = jwt.sign(
      { userId: user.id.toString(), role: user.role.name },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    const { passwordHash: _, pinHash: __, ...userWithoutSecrets } = user;

    return {
      token,
      user: userWithoutSecrets,
    };
  }

  static async getProfile(userId: string) {
    const user = await db.user.findUnique({
      where: { id: BigInt(userId) },
      include: { role: true },
    });

    if (!user) {
      throw new Error('Usuario no encontrado.');
    }

    const { passwordHash: _, pinHash: __, ...userWithoutSecrets } = user;
    return userWithoutSecrets;
  }
}