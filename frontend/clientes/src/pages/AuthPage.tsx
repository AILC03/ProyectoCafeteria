import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import { PinInput } from '../components/PinInput';
import { registerWithTicket } from '../api/registration';

export const AuthPage: React.FC = () => {
  const { login, guestLogin, isLoading } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'login' | 'register'>('login');

  // Estados del formulario de login
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados del formulario de registro con ticket
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPin, setRegPin] = useState('');
  const [regToken, setRegToken] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!identifier.trim()) {
      showToast('Por favor introduce tu teléfono o número de cliente.', 'warning');
      return;
    }

    if (pin.length !== 4) {
      showToast('El PIN debe tener 4 dígitos exactos.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await login(identifier, pin);
      if (res.success) {
        showToast('¡Sesión iniciada con éxito! Bienvenido de vuelta. ☕', 'success');
        navigate('/menu');
      } else {
        showToast(res.message || 'Credenciales incorrectas.', 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!regName.trim()) {
      showToast('Por favor introduce tu nombre completo.', 'warning');
      return;
    }

    const cleanPhone = regPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      showToast('Introduce un número celular de 10 dígitos (ej. 5512345678).', 'warning');
      return;
    }

    if (regPin.length !== 4) {
      showToast('El PIN debe tener 4 dígitos exactos.', 'warning');
      return;
    }

    if (!regToken.trim()) {
      showToast('Ingresa el código de 43 caracteres que aparece al final de tu ticket de compra.', 'warning');
      return;
    }

    setIsRegistering(true);
    try {
      const customer = await registerWithTicket({
        token: regToken.trim(),
        name: regName.trim(),
        phone: cleanPhone,
        pin: regPin,
      });

      showToast(`¡Cuenta ${customer.customerNumber} creada con éxito en la base de datos! Iniciando sesión... ☕`, 'success');
      const loginRes = await login(cleanPhone, regPin);
      if (loginRes.success) {
        navigate('/menu');
      } else {
        setMode('login');
      }
    } catch (err: any) {
      showToast(err.message || 'Código de registro inválido o expirado.', 'error');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleGuest = () => {
    guestLogin('Invitado');
    showToast('Has ingresado como invitado. ¡Disfruta tu pedido!', 'info');
    navigate('/menu');
  };

  return (
    <main className="w-full min-h-screen bg-surface flex flex-col justify-center items-center py-6 px-4">
      <div className="flex flex-col w-full max-w-md mx-auto gap-5">
        {/* Brand Header */}
        <div className="flex items-center justify-between py-1">
          <img
            src="/logo.png"
            alt="COFFEE'S POS"
            className="h-12 w-auto object-contain max-w-[210px]"
          />
          <span className="text-[11px] font-bold uppercase tracking-wider text-secondary bg-secondary-fixed/40 px-2.5 py-1 rounded-full border border-secondary-container/40">
            Roastery Express
          </span>
        </div>

        {/* Hero Card Banner */}
        <div className="relative overflow-hidden rounded-lg bg-surface-container-low shadow-sm min-h-[200px] p-5 flex flex-col justify-between">
          <div
            className="absolute inset-0 bg-cover bg-center"
            data-alt="Elegante cafetería de especialidad moderna con luz natural cálida y baristas artesanos"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=800&q=80')",
            }}
          ></div>
          <div className="absolute inset-0 bg-gradient-to-t from-primary/95 via-primary/60 to-transparent"></div>

          <div className="relative z-10">
            <span className="text-[11px] font-bold uppercase tracking-wider text-secondary-container bg-primary/80 px-2.5 py-0.5 rounded-full inline-block">
              Bienvenido
            </span>
          </div>

          <div className="relative z-10 flex flex-col gap-1 text-white">
            <h1 className="text-xl sm:text-2xl font-extrabold leading-tight">
              Café de especialidad a tu alcance
            </h1>
            <p className="text-xs text-white/80 line-clamp-2">
              Haz tu pedido desde tu móvil, personaliza a tu gusto y recoge en barra sin filas.
            </p>
          </div>
        </div>

        {/* Ventajas */}
        <div className="grid grid-cols-3 gap-2 py-1">
          <div className="flex flex-col items-center text-center p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 shadow-xs">
            <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container mb-1">
              <span className="material-symbols-outlined text-lg">local_cafe</span>
            </div>
            <span className="font-semibold text-xs text-on-surface leading-tight">Tostado</span>
            <span className="text-[11px] text-on-surface-variant leading-tight">Artesanal</span>
          </div>

          <div className="flex flex-col items-center text-center p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 shadow-xs">
            <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container mb-1">
              <span className="material-symbols-outlined text-lg">favorite</span>
            </div>
            <span className="font-semibold text-xs text-on-surface leading-tight">Favoritos</span>
            <span className="text-[11px] text-on-surface-variant leading-tight">Guardados</span>
          </div>

          <div className="flex flex-col items-center text-center p-2 rounded-lg bg-surface-container-lowest border border-outline-variant/30 shadow-xs">
            <div className="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container mb-1">
              <span className="material-symbols-outlined text-lg">qr_code_2</span>
            </div>
            <span className="font-semibold text-xs text-on-surface leading-tight">Rápido</span>
            <span className="text-[11px] text-on-surface-variant leading-tight">Pago con QR</span>
          </div>
        </div>

        {/* Main Interactive Form Card */}
        <div className="w-full flex flex-col bg-surface-container-lowest rounded-lg p-5 shadow-md gap-4 border border-outline-variant/40">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-surface-container rounded-lg border border-outline-variant/30 text-xs font-bold">
            <button
              type="button"
              onClick={() => setMode('login')}
              className={`py-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                mode === 'login'
                  ? 'bg-surface-container-lowest text-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-sm">login</span>
              <span>INICIAR SESIÓN</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('register')}
              className={`py-2 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                mode === 'register'
                  ? 'bg-surface-container-lowest text-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-sm">receipt_long</span>
              <span>REGISTRAR CON TICKET</span>
            </button>
          </div>

          {mode === 'login' ? (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="font-headline-sm text-lg font-bold text-on-surface">
                  Inicia sesión
                </h2>
                <p className="font-body-md text-on-surface-variant text-xs">
                  Ingresa con tu teléfono o número de cliente para acumular beneficios.
                </p>
              </div>

              {/* Form Login */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* Field 1: Identifier */}
                <div className="flex flex-col gap-1.5">
                  <label
                    className="flex items-center justify-between font-label-md text-label-md text-on-surface"
                    htmlFor="identifier"
                  >
                    <span className="flex items-center gap-1.5 font-semibold text-xs sm:text-sm">
                      <span className="material-symbols-outlined text-secondary text-base">phone_iphone</span>{' '}
                      1. Teléfono o No. de Cliente
                    </span>
                    <span className="font-label-md text-[11px] text-outline">
                      Identificador
                    </span>
                  </label>
                  <div className="relative">
                    <input
                      id="identifier"
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Ej. 5512345678 o C000105"
                      className="w-full h-12 px-4 rounded-DEFAULT bg-surface-container-low text-on-surface font-body-md text-sm placeholder:text-outline/70 focus:outline-none focus:bg-surface-container transition-all border border-outline-variant/40"
                    />
                  </div>
                </div>

                {/* Field 2: 4-digit PIN */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 font-label-md text-xs sm:text-sm font-semibold text-on-surface">
                      <span className="material-symbols-outlined text-secondary text-base">pin</span>
                      <span>2. PIN de 4 dígitos</span>
                    </label>
                    <span className="font-label-md text-[11px] text-outline">
                      Código secreto
                    </span>
                  </div>

                  <PinInput value={pin} onChange={setPin} />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || isLoading}
                  className="w-full h-12 rounded-DEFAULT bg-primary-container text-on-primary hover:bg-primary font-bold text-xs tracking-wider flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 mt-1"
                >
                  {isSubmitting ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                      <span>INGRESANDO...</span>
                    </>
                  ) : (
                    <>
                      <span>INGRESAR AL MENÚ</span>
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="font-headline-sm text-lg font-bold text-on-surface">
                  Registrar con Ticket de Compra
                </h2>
                <p className="font-body-md text-on-surface-variant text-xs">
                  Crea tu cuenta oficial vinculada a tu ticket de mostrador para acumular puntos y beneficios.
                </p>
              </div>

              {/* Form Register */}
              <form onSubmit={handleRegister} className="flex flex-col gap-3">
                {/* Name */}
                <div className="flex flex-col gap-1">
                  <label className="flex items-center gap-1.5 font-semibold text-xs text-on-surface" htmlFor="regName">
                    <span className="material-symbols-outlined text-secondary text-base">badge</span>
                    <span>Nombre Completo</span>
                  </label>
                  <input
                    id="regName"
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="Ej. Mariana López"
                    className="w-full h-11 px-3 rounded-DEFAULT bg-surface-container-low text-on-surface font-body-md text-xs sm:text-sm placeholder:text-outline/70 focus:outline-none focus:bg-surface-container transition-all border border-outline-variant/40"
                  />
                </div>

                {/* Phone */}
                <div className="flex flex-col gap-1">
                  <label className="flex items-center justify-between text-xs font-semibold text-on-surface" htmlFor="regPhone">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-secondary text-base">phone_iphone</span>
                      <span>Teléfono Móvil (10 dígitos)</span>
                    </span>
                    <span className="text-[11px] text-outline">México (+52)</span>
                  </label>
                  <input
                    id="regPhone"
                    type="tel"
                    required
                    maxLength={10}
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="Ej. 5512345678"
                    className="w-full h-11 px-3 rounded-DEFAULT bg-surface-container-low text-on-surface font-body-md text-xs sm:text-sm placeholder:text-outline/70 focus:outline-none focus:bg-surface-container transition-all border border-outline-variant/40"
                  />
                </div>

                {/* PIN */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-on-surface">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-secondary text-base">lock</span>
                      <span>PIN Secreto (4 dígitos)</span>
                    </span>
                    <span className="text-[11px] text-outline">Para tus inicios de sesión</span>
                  </div>
                  <PinInput value={regPin} onChange={setRegPin} />
                </div>

                {/* Ticket Token */}
                <div className="flex flex-col gap-1">
                  <label className="flex items-center justify-between text-xs font-semibold text-on-surface" htmlFor="regToken">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-secondary text-base">receipt</span>
                      <span>Código de Registro del Ticket</span>
                    </span>
                    <span className="text-[11px] text-outline">43 caracteres</span>
                  </label>
                  <input
                    id="regToken"
                    type="text"
                    required
                    value={regToken}
                    onChange={(e) => setRegToken(e.target.value)}
                    placeholder="Token impreso al pie de tu ticket"
                    className="w-full h-11 px-3 rounded-DEFAULT bg-surface-container-low text-on-surface font-mono text-xs placeholder:text-outline/70 focus:outline-none focus:bg-surface-container transition-all border border-outline-variant/40"
                  />
                  <p className="text-[11px] text-outline leading-tight mt-0.5">
                    * Tu token se imprime automáticamente en mostrador al pagar cualquier orden. Si no tienes uno, puedes entrar como invitado.
                  </p>
                </div>

                {/* Register Submit Button */}
                <button
                  type="submit"
                  disabled={isRegistering || isLoading}
                  className="w-full h-12 rounded-DEFAULT bg-primary-container text-on-primary hover:bg-primary font-bold text-xs tracking-wider flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 mt-1"
                >
                  {isRegistering ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                      <span>GUARDANDO EN BASE DE DATOS...</span>
                    </>
                  ) : (
                    <>
                      <span>CREAR CUENTA EN BASE DE DATOS</span>
                      <span className="material-symbols-outlined text-base">how_to_reg</span>
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* Guest Action */}
          <div className="flex flex-col gap-3 pt-2 border-t border-outline-variant/40">
            <button
              type="button"
              onClick={handleGuest}
              className="w-full h-11 rounded-DEFAULT border border-secondary text-secondary hover:bg-secondary-fixed/20 font-bold text-xs tracking-wider flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <span className="material-symbols-outlined text-base">person</span>
              <span>CONTINUAR COMO INVITADO</span>
            </button>
            <p className="text-[11px] text-center text-outline">
              Puedes ordenar sin cuenta y pagar en barra con tu código de pedido.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
};
