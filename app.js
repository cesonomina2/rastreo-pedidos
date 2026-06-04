// app.js - El Director de Orquesta Seguro y Optimizado

const App = {
    usuarioActual: null,
    estadoFiltroActivo: 'pendiente_respuesta',
    turnoActivoId: null,
    turnoActivoTelefono: null, 

    init() {
        this.verificarSesion();
        this.configurarNavegacion();
        this.configurarCerrarSesion();
        this.configurarFiltrosBolsa();
        this.configurarEventosChat();
        this.configurarAccionesManuales();
    },

    verificarSesion() {
        const userStr = localStorage.getItem('saberbot_user');
        if (userStr) {
            this.usuarioActual = JSON.parse(userStr);
            
            document.getElementById('login-view').classList.add('hidden');
            document.getElementById('app-view').classList.remove('hidden');
            document.getElementById('app-view').classList.add('flex');
            
            document.getElementById('user-name-display').innerText = this.usuarioActual.nombre_completo;
            document.getElementById('user-role-display').innerText = this.usuarioActual.rol;

            if (this.usuarioActual.rol !== 'administrador') {
                document.getElementById('menu-usuarios').classList.add('hidden');
            }

            this.cargarBolsaComun();
            this.iniciarMotorTiempoReal();
        }
    },

    iniciarMotorTiempoReal() {
        supabaseClient.channel('cambios-globales')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_chat' }, payload => {
                const nuevoMensaje = payload.new;
                if(this.turnoActivoId === nuevoMensaje.requerimiento_id) {
                    this.pintarBurbuja(nuevoMensaje.tipo, nuevoMensaje.autor, nuevoMensaje.texto, nuevoMensaje.hora_registro);
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'requerimientos_turnos' }, payload => {
                this.actualizarContadores();
                this.cargarBolsaComun(true); 
            })
            .subscribe();
    },

    configurarNavegacion() {
        const links = document.querySelectorAll('.nav-link');
        const vistas = ['view-dashboard', 'view-operacion', 'view-usuarios'];

        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('data-target');

                vistas.forEach(viewId => {
                    const view = document.getElementById(viewId);
                    if(view) {
                        view.classList.add('hidden');
                        if(viewId === 'view-operacion') view.classList.remove('flex');
                    }
                });

                const targetView = document.getElementById(targetId);
                if (targetView) {
                    targetView.classList.remove('hidden');
                    if(targetId === 'view-operacion') targetView.classList.add('flex'); 
                }

                links.forEach(l => {
                    l.classList.remove('bg-slate-800', 'border-l-4', 'border-[#8DC63F]', 'text-white', 'font-bold');
                    l.classList.add('text-slate-300', 'font-medium', 'hover:bg-slate-800');
                    const icon = l.querySelector('i');
                    if(icon) icon.classList.remove('text-[#8DC63F]');
                });

                link.classList.remove('text-slate-300', 'font-medium', 'hover:bg-slate-800');
                link.classList.add('bg-slate-800', 'border-l-4', 'border-[#8DC63F]', 'text-white', 'font-bold');
                const activeIcon = link.querySelector('i');
                if(activeIcon) activeIcon.classList.add('text-[#8DC63F]');
                
                if(window.innerWidth < 768) toggleMenu();
            });
        });
    },

    configurarCerrarSesion() {
        document.getElementById('btn-logout').addEventListener('click', async () => {
            const btn = document.getElementById('btn-logout');
            btn.innerHTML = '<i class="fas fa-spinner fa-spin w-6"></i> Saliendo...';
            await API.logout();
            window.location.reload();
        });
    },

    configurarFiltrosBolsa() {
        const botonesFiltro = document.querySelectorAll('.filtro-btn');
        botonesFiltro.forEach(btn => {
            btn.addEventListener('click', () => {
                const filtroId = btn.getAttribute('data-filtro');

                botonesFiltro.forEach(b => {
                    b.classList.remove('bg-[#0085CA]', 'bg-slate-700', 'text-white', 'border-[#0085CA]', 'border-slate-700');
                    b.classList.add('bg-white', 'text-slate-500', 'border-slate-200');
                    const span = b.querySelector('span');
                    if(span) {
                        span.classList.remove('bg-white', 'text-[#0085CA]');
                        span.classList.add('bg-slate-200', 'text-slate-600');
                    }
                });

                if (filtroId === 'cerrado') {
                    btn.classList.remove('bg-white', 'text-slate-500', 'border-slate-200');
                    btn.classList.add('bg-slate-700', 'text-white', 'border-slate-700');
                } else {
                    btn.classList.remove('bg-white', 'text-slate-500', 'border-slate-200');
                    btn.classList.add('bg-[#0085CA]', 'text-white', 'border-[#0085CA]');
                    const span = btn.querySelector('span');
                    if(span) {
                        span.classList.remove('bg-slate-200', 'text-slate-600');
                        span.classList.add('bg-white', 'text-[#0085CA]');
                    }
                }

                this.estadoFiltroActivo = filtroId;
                this.cargarBolsaComun(); 
            });
        });
    },

    async actualizarContadores() {
        try {
            const { data, error } = await supabaseClient
                .from('requerimientos_turnos')
                .select('estado_operativo')
                .is('gestionado_por', null); 

            if (error) throw error;

            const counts = { pendiente_respuesta: 0, consulta: 0, si: 0, no: 0 };
            data.forEach(t => {
                if (counts[t.estado_operativo] !== undefined) counts[t.estado_operativo]++;
            });

            document.getElementById('count-pendientes').innerText = counts.pendiente_respuesta;
            document.getElementById('count-consulta').innerText = counts.consulta;
            document.getElementById('count-si').innerText = counts.si;
            document.getElementById('count-no').innerText = counts.no;

        } catch (err) {
            console.error("Error al contar turnos:", err);
        }
    },

    configurarEventosChat() {
        document.getElementById('btn-cerrar-chat').addEventListener('click', async () => {
            if (!this.turnoActivoId) return;
            
            if(confirm("¿Estás seguro de que deseas cerrar este requerimiento?")) {
                try {
                    const { error } = await supabaseClient
                        .from('requerimientos_turnos')
                        .update({ estado_operativo: 'cerrado', gestionado_por: null })
                        .eq('id', this.turnoActivoId);
                    if (error) throw error;

                    this.turnoActivoId = null;
                    document.getElementById('chat-activo').classList.add('hidden');
                    document.getElementById('chat-activo').classList.remove('flex');
                    document.getElementById('chat-vacio').classList.remove('hidden');
                    document.getElementById('chat-vacio').classList.add('flex');
                    
                    this.cargarBolsaComun(); 
                } catch (err) {
                    alert("Error al cerrar: " + err.message);
                }
            }
        });

        const inputChat = document.getElementById('chat-input');
        const btnEnviar = document.getElementById('btn-enviar-msg');

        inputChat.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.enviarMensaje();
            }
        });
        btnEnviar.addEventListener('click', () => { this.enviarMensaje(); });
    },

    configurarAccionesManuales() {
        document.getElementById('btn-confirmar').addEventListener('click', () => {
            this.ejecutarAccionManual('✅ El turno fue confirmado manualmente por el coordinador.');
        });

        document.getElementById('btn-rechazar').addEventListener('click', () => {
            this.ejecutarAccionManual('❌ El turno fue cancelado/rechazado manualmente por el coordinador.');
        });
    },

    async ejecutarAccionManual(mensajeSistema) {
        if (!this.turnoActivoId) return;

        if(!confirm("Esta acción cerrará el turno inmediatamente. ¿Deseas continuar?")) return;

        try {
            await supabaseClient.from('mensajes_chat').insert([{
                requerimiento_id: this.turnoActivoId,
                tipo: 'sistema',
                autor: this.usuarioActual.nombre_completo,
                texto: mensajeSistema
            }]);

            const { error } = await supabaseClient
                .from('requerimientos_turnos')
                .update({ 
                    estado_operativo: 'cerrado', 
                    gestionado_por: this.usuarioActual.cedula 
                })
                .eq('id', this.turnoActivoId);

            if (error) throw error;

            this.turnoActivoId = null;
            document.getElementById('chat-activo').classList.add('hidden');
            document.getElementById('chat-activo').classList.remove('flex');
            document.getElementById('chat-vacio').classList.remove('hidden');
            document.getElementById('chat-vacio').classList.add('flex');
            
            this.cargarBolsaComun(); 

        } catch (err) {
            console.error("Error en gestión manual:", err);
            alert("No se pudo procesar la acción.");
        }
    },

    async enviarMensaje() {
        const input = document.getElementById('chat-input');
        const texto = input.value.trim();
        
        if(!texto || !this.turnoActivoId || !this.turnoActivoTelefono) return;

        input.value = ''; 
        const nuevoMensaje = {
            requerimiento_id: this.turnoActivoId,
            tipo: 'salida',
            autor: this.usuarioActual.nombre_completo,
            texto: texto
        };

        try {
            // TAREA 1: Guardar en Supabase (Historial)
            const { error } = await supabaseClient.from('mensajes_chat').insert([nuevoMensaje]);
            if (error) throw error;

            // TAREA 2: Enviar al Webhook de n8n (CON LLAVE DE SEGURIDAD)
            await fetch('https://n8n.casalimpia.com/webhook/respuesta-coordinador', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer Casalimpia.SPN*2026' // ¡AQUÍ ESTÁ EL CANDADO!
                },
                body: JSON.stringify({
                    telefono: this.turnoActivoTelefono,
                    texto: texto
                })
            });

        } catch (err) {
            console.error("Error enviando:", err);
            alert("Hubo un error al enviar el mensaje.");
        }
    },

    async cargarBolsaComun(silencioso = false) {
        this.actualizarContadores();
        const contenedor = document.getElementById('lista-turnos-container');
        
        if(!silencioso) {
            contenedor.innerHTML = '<div class="p-6 text-center text-slate-500"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>Cargando...</p></div>';
        }

        try {
            // PAGINACIÓN: Solo los 30 más recientes
            let query = supabaseClient.from('requerimientos_turnos')
                .select('*')
                .eq('estado_operativo', this.estadoFiltroActivo)
                .order('created_at', { ascending: false })
                .limit(30); 

            if (this.estadoFiltroActivo !== 'cerrado') {
                query = query.is('gestionado_por', null);
            }

            const { data, error } = await query;
            if (error) throw error;

            contenedor.innerHTML = ''; 

            if (data.length === 0) {
                contenedor.innerHTML = `<div class="p-8 text-center text-slate-400"><i class="fas fa-inbox text-4xl mb-3 text-slate-200"></i><p class="text-sm">No hay turnos en esta categoría.</p></div>`;
                return;
            }

            data.forEach(turno => {
                const tarjeta = document.createElement('div');
                tarjeta.className = 'p-4 border-b hover:bg-slate-50 cursor-pointer border-l-4 transition-colors';
                
                if(this.turnoActivoId === turno.id) {
                    tarjeta.classList.add('bg-slate-100');
                }

                if(this.estadoFiltroActivo === 'pendiente_respuesta') tarjeta.classList.add('border-amber-400');
                if(this.estadoFiltroActivo === 'si') tarjeta.classList.add('border-emerald-500');
                if(this.estadoFiltroActivo === 'no') tarjeta.classList.add('border-rose-500');
                if(this.estadoFiltroActivo === 'consulta') tarjeta.classList.add('border-[#0085CA]');
                if(this.estadoFiltroActivo === 'cerrado') tarjeta.classList.add('border-slate-500', 'bg-slate-50', 'opacity-70');

                const horaLocal = new Date(turno.created_at).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });

                tarjeta.innerHTML = `
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-slate-800 text-sm uppercase">${turno.nombres_completos}</h4>
                    </div>
                    <p class="text-xs text-slate-500 mt-1">C.C. ${turno.reemplazo_cedula || 'N/A'} - Tel: ${turno.telefono}</p>
                    <div class="mt-2 flex justify-between items-center">
                        <span class="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] uppercase font-bold rounded-md tracking-wide">${this.estadoFiltroActivo.replace('_', ' ')}</span>
                        <span class="text-xs text-slate-400 font-medium">${horaLocal}</span>
                    </div>
                `;

                tarjeta.addEventListener('click', () => {
                    this.abrirChat(turno);
                    const todas = document.querySelectorAll('#lista-turnos-container > div');
                    todas.forEach(t => t.classList.remove('bg-slate-100'));
                    tarjeta.classList.add('bg-slate-100');
                });

                contenedor.appendChild(tarjeta);
            });

            // Aviso visual si hay más turnos que el límite
            if(data.length === 30) {
                const aviso = document.createElement('div');
                aviso.className = 'text-center p-3 text-xs text-slate-400 font-medium bg-slate-50';
                aviso.innerHTML = '<i class="fas fa-info-circle"></i> Mostrando los 30 turnos más recientes.';
                contenedor.appendChild(aviso);
            }

        } catch (err) {
            console.error('Error:', err);
            contenedor.innerHTML = '<div class="p-4 text-center text-rose-500 text-sm">Error de conexión.</div>';
        }
    },

    abrirChat(turno) {
        this.turnoActivoId = turno.id;
        this.turnoActivoTelefono = turno.telefono; 

        document.getElementById('chat-vacio').classList.add('hidden');
        document.getElementById('chat-vacio').classList.remove('flex');
        document.getElementById('chat-activo').classList.remove('hidden');
        document.getElementById('chat-activo').classList.add('flex');

        document.getElementById('chat-header-nombre').innerText = turno.nombres_completos;
        document.getElementById('chat-header-cedula').innerText = `C.C. ${turno.reemplazo_cedula || 'N/A'} | Tel: ${turno.telefono}`;
        document.getElementById('chat-info-cliente').innerText = turno.nombre_cliente || 'N/A';
        document.getElementById('chat-info-horario').innerText = `${turno.horario_inicio || ''} - ${turno.horario_fin || ''}`;

        const panelBotones = document.getElementById('panel-acciones-manuales');
        const areaEscritura = document.getElementById('area-escritura');
        const avisoMeta = document.getElementById('aviso-meta');

        if (turno.estado_operativo === 'pendiente_respuesta') {
            panelBotones.classList.remove('hidden'); panelBotones.classList.add('flex');
            areaEscritura.classList.add('hidden'); areaEscritura.classList.remove('flex');
            avisoMeta.classList.remove('hidden');
        } else if (turno.estado_operativo === 'cerrado') {
            panelBotones.classList.add('hidden'); panelBotones.classList.remove('flex');
            areaEscritura.classList.add('hidden'); areaEscritura.classList.remove('flex');
            avisoMeta.classList.add('hidden');
        } else {
            panelBotones.classList.add('hidden'); panelBotones.classList.remove('flex');
            areaEscritura.classList.remove('hidden'); areaEscritura.classList.add('flex');
            avisoMeta.classList.add('hidden');
        }

        this.cargarMensajes(turno.id);

        if(window.innerWidth < 768) {
            document.getElementById('section-lista').classList.add('hidden');
            document.getElementById('section-chat').classList.remove('hidden');
            document.getElementById('section-chat').classList.add('flex');
        }
    },

    async cargarMensajes(requerimientoId) {
        const contenedor = document.getElementById('contenedor-mensajes');
        contenedor.innerHTML = '<div class="text-center text-slate-400 mt-10"><i class="fas fa-spinner fa-spin text-xl"></i> Cargando chat...</div>';

        try {
            // PAGINACIÓN DE CHAT: Solo últimos 30 mensajes
            const { data, error } = await supabaseClient
                .from('mensajes_chat')
                .select('*')
                .eq('requerimiento_id', requerimientoId)
                .order('hora_registro', { ascending: false })
                .limit(30);

            if (error) throw error;
            contenedor.innerHTML = ''; 

            if (data.length === 0) {
                contenedor.innerHTML = '<div class="text-center text-slate-400 mt-10 text-sm">No hay mensajes.</div>';
                return;
            }

            // Invertimos para leer de arriba hacia abajo
            const mensajesOrdenados = data.reverse();

            if(mensajesOrdenados.length === 30) {
                contenedor.innerHTML = '<div class="text-center text-xs text-slate-400 mb-2 mt-2 font-medium">Mostrando últimos 30 mensajes...</div>';
            }

            mensajesOrdenados.forEach(msg => {
                this.pintarBurbuja(msg.tipo, msg.autor, msg.texto, msg.hora_registro);
            });

        } catch (err) {
            contenedor.innerHTML = '<div class="text-center text-rose-500 mt-10 text-sm">Error cargando chat.</div>';
        }
    },

    pintarBurbuja(tipo, autor, texto, horaRaw) {
        const contenedor = document.getElementById('contenedor-mensajes');
        
        if(contenedor.innerHTML.includes('No hay mensajes')) {
            contenedor.innerHTML = '';
        }

        const horaLocal = new Date(horaRaw).toLocaleTimeString('es-CO', { 
            timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' 
        });

        const div = document.createElement('div');

        if (tipo === 'entrada') {
            div.className = 'flex justify-start relative z-10';
            div.innerHTML = `
                <div class="bg-white p-3.5 rounded-2xl rounded-tl-none shadow-sm max-w-[85%] md:max-w-md border border-slate-200">
                    <p class="text-[10px] text-slate-400 font-bold mb-1 uppercase tracking-wide">${autor}</p>
                    <p class="text-slate-700 text-sm whitespace-pre-wrap">${texto}</p>
                    <span class="text-[10px] text-slate-400 float-right mt-1.5 ml-4 font-medium">${horaLocal}</span>
                </div>`;
        } 
        else if (tipo === 'salida') {
            div.className = 'flex justify-end relative z-10';
            div.innerHTML = `
                <div class="bg-[#dcf8c6] p-3.5 rounded-2xl rounded-tr-none shadow-sm max-w-[85%] md:max-w-md border border-[#c3e6a8]">
                    <p class="text-[10px] text-emerald-700 font-bold mb-1 uppercase tracking-wide">${autor}</p>
                    <p class="text-slate-800 text-sm whitespace-pre-wrap">${texto}</p>
                    <span class="text-[10px] text-slate-500 float-right mt-1.5 ml-4 font-medium">${horaLocal}</span>
                </div>`;
        }
        else if (tipo === 'sistema') {
            div.className = 'flex justify-center relative z-10 my-2';
            div.innerHTML = `
                <div class="bg-blue-50 text-blue-800 text-[10px] md:text-xs px-4 py-1.5 rounded-full border border-blue-200 text-center font-medium shadow-sm">
                    <i class="fas fa-info-circle mr-1"></i> ${texto}
                </div>`;
        }

        contenedor.appendChild(div);
        
        const zonaChat = document.querySelector('#section-chat .overflow-y-auto');
        zonaChat.scrollTop = zonaChat.scrollHeight;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});