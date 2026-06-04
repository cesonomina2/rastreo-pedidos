// api.js

// 1. Credenciales de tu Supabase
const SUPABASE_URL = 'https://spetbesqvxdolrrcwsbm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_nrrgCbgmM-jtR1hJFaVGDg_mizIWwx5';

// Solución al choque: lo nombramos 'supabaseClient'
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const API = {
    // ==========================================
    // 1. INICIAR SESIÓN
    // ==========================================
    async login(usuario, password) {
        try {
            let emailLogin = usuario;

            // Lógica Dual: Si no tiene '@', le ponemos el disfraz de correo local
            if (!usuario.includes('@')) {
                emailLogin = `${usuario}@casalimpia.local`;
            }

            // A. Autenticar con Supabase Auth
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: emailLogin,
                password: password
            });

            if (error) throw error;

            // B. Traer el perfil desde nuestra tabla
            const perfil = await this.obtenerPerfil(usuario);
            
            if (!perfil) {
                await this.logout();
                return { success: false, error: "El usuario existe, pero no está registrado en la base de datos de la plataforma." };
            }

            if (perfil.estado === 'inactivo') {
                await this.logout();
                return { success: false, error: "Este usuario está inactivo. Contacta a un administrador." };
            }

            // C. Guardar la sesión localmente
            localStorage.setItem('saberbot_user', JSON.stringify(perfil));

            return { success: true, perfil: perfil };

        } catch (error) {
            console.error("Error de Login:", error);
            // Hacemos que el error sea legible para ti
            let msg = error.message || "Error desconocido al conectar con Supabase.";
            if (msg.includes('Invalid login credentials')) {
                msg = "Credenciales incorrectas. Verifica tu usuario y contraseña.";
            }
            return { success: false, error: msg };
        }
    },

    // ==========================================
    // 2. OBTENER PERFIL DE USUARIO
    // ==========================================
    async obtenerPerfil(identificador) {
        let query = supabaseClient.from('usuarios_plataforma').select('*');
        
        if (identificador.includes('@')) {
            query = query.eq('correo', identificador);
        } else {
            query = query.eq('cedula', identificador);
        }

        const { data, error } = await query.single();
        if (error) throw error;
        
        return data;
    },

    // ==========================================
    // 3. CERRAR SESIÓN
    // ==========================================
    async logout() {
        const { error } = await supabaseClient.auth.signOut();
        localStorage.removeItem('saberbot_user');
        if (error) console.error("Error al salir:", error);
    }
};