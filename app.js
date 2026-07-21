// app.js - Director de Orquesta Dual (SIC + Consultas)

const App = {
    usuarioActual: null,
    vistaAsignacionActiva: 'comun', // comun | mis_turnos | en_atencion
    estadoFiltroActivo: 'pendiente_respuesta',
    turnoActivoId: null,
    turnoActivoTelefono: null,
    turnoActivoDatos: null, 
    diccionarioUsuarios: {},

    init() {
        this.verificarSesion();
        this.configurarNavegacion();
        this.configurarCerrarSesion();
        this.configurarFiltrosBolsa();
        this.configurarEventosChat();
        this.configurarAccionesManuales();
        
        const formUsuario = document.getElementById('form-usuario');
        if (formUsuario) {
            formUsuario.addEventListener('submit', (e) => this.guardarNuevoUsuario(e));
        }
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
            } else {
                document.getElementById('tab-en-atencion').classList.remove('hidden');
                document.getElementById('tab-en-atencion').classList.add('flex-1');
            }

            this.cargarDiccionarioUsuarios();
            this.cargarRespuestasRapidas();
            this.cargarBolsaComun();
            this.iniciarMotorTiempoReal();
            this.controlarAlertasVisuales();
        }
    },

    async cargarDiccionarioUsuarios() {
        try {
            const { data, error } = await supabaseClient
                .from('usuarios_plataforma')
                .select('cedula, nombre_completo');
            if (error) throw error;
            
            data.forEach(user => {
                this.diccionarioUsuarios[user.cedula] = user.nombre_completo;
            });
        } catch (err) {
            console.error("Error cargando diccionario:", err);
        }
    },

    // LA MAGIA: Determina qué tabla usar dependiendo del botón clickeado
    obtenerTablaActual() {
        return this.estadoFiltroActivo === 'consulta' ? 'consultas_generales' : 'requerimientos_turnos_sic';
    },

    iniciarMotorTiempoReal() {
        supabaseClient.channel('cambios-globales')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes_chat' }, payload => {
                const nuevoMensaje = payload.new;
                
                if(this.turnoActivoId === nuevoMensaje.requerimiento_id) {
                    this.pintarBurbuja(nuevoMensaje.tipo, nuevoMensaje.autor, nuevoMensaje.texto, nuevoMensaje.hora_registro);
                } 
                else if (nuevoMensaje.tipo === 'entrada') {
                    const tarjeta = document.querySelector(`div[data-id="${nuevoMensaje.requerimiento_id}"]`);
                    if (tarjeta) {
                        tarjeta.classList.add('animate-pulse', 'border-rose-500', 'bg-rose-50', 'border-l-8');
                        const titulo = tarjeta.querySelector('h4');
                        if (titulo && !titulo.innerHTML.includes('fa-bell')) {
                            titulo.innerHTML = `<i class="fas fa-bell text-rose-500 mr-1"></i> ` + titulo.innerHTML;
                        }
                    }
                }
            })
            // Escuchar cambios en la tabla del SIC
            .on('postgres_changes', { event: '*', schema: 'public', table: 'requerimientos_turnos_sic' }, () => {
                this.actualizarContadores();
                this.controlarAlertasVisuales();
                if(this.estadoFiltroActivo !== 'consulta') this.cargarBolsaComun(true); 
            })
            // Escuchar cambios en la tabla de Consultas
            .on('postgres_changes', { event: '*', schema: 'public', table: 'consultas_generales' }, () => {
                this.actualizarContadores();
                // 🌟 LÍNEA CORREGIDA: Ahora sí dispara las alarmas cuando una consulta cambia
                this.controlarAlertasVisuales(); 
                if(this.estadoFiltroActivo === 'consulta') this.cargarBolsaComun(true); 
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
                    
                    if(targetId === 'view-usuarios') {
                        App.cargarUsuarios();
                        App.cargarRespuestasRapidas();
                        App.cargarConfiguracionTiempo();
                        App.cargarConfiguracionMensajesAuto();
                    }
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
        const btnLogout = document.getElementById('btn-logout');
        if(btnLogout) {
            btnLogout.addEventListener('click', async () => {
                btnLogout.innerHTML = '<i class="fas fa-spinner fa-spin w-6"></i> Saliendo...';
                localStorage.removeItem('saberbot_user');
                window.location.reload();
            });
        }
    },

    cambiarVistaBolsa(vista) {
        this.vistaAsignacionActiva = vista;
        
        const btnComun = document.getElementById('tab-bolsa-comun');
        const btnMis = document.getElementById('tab-mis-turnos');
        const btnAdmin = document.getElementById('tab-en-atencion');

        [btnComun, btnMis, btnAdmin].forEach(b => {
            if(b) {
                b.className = b.className.replace(/bg-gradient-casalimpia|bg-\[#8DC63F\]|bg-\[#0085CA\]|bg-amber-500|text-white|shadow/g, '');
                if (!b.classList.contains('border-rose-500')) {
                    b.classList.add('bg-white', 'border', 'border-slate-200', 'text-slate-500');
                } else {
                    b.classList.add('bg-white', 'border', 'text-slate-500');
                }
            }
        });

        if (vista === 'comun') {
            btnComun.classList.remove('bg-white', 'border', 'text-slate-500');
            btnComun.classList.add('bg-[#8DC63F]', 'text-white', 'shadow');
        } else if (vista === 'mis_turnos') {
            btnMis.classList.remove('bg-white', 'border', 'text-slate-500');
            btnMis.classList.add('bg-[#0085CA]', 'text-white', 'shadow');
        } else if (vista === 'en_atencion') {
            btnAdmin.classList.remove('bg-white', 'border', 'text-slate-500');
            btnAdmin.classList.add('bg-amber-500', 'text-white', 'shadow');
        }

        this.cargarBolsaComun();
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

                // Limpiamos el chat al cambiar de filtro para no arrastrar info equivocada
                document.getElementById('chat-activo').classList.add('hidden');
                document.getElementById('chat-activo').classList.remove('flex');
                document.getElementById('chat-vacio').classList.remove('hidden');
                document.getElementById('chat-vacio').classList.add('flex');
                this.turnoActivoId = null;

                this.estadoFiltroActivo = filtroId;
                this.cargarBolsaComun(); 
            });
        });
    },

    async actualizarContadores() {
        try {
            // Contamos SIC y Consultas al mismo tiempo
            let qSic = supabaseClient.from('requerimientos_turnos_sic').select('estado_operativo');
            let qCons = supabaseClient.from('consultas_generales').select('id');

            if (this.vistaAsignacionActiva === 'comun') {
                qSic = qSic.is('gestionado_por', null);
                qCons = qCons.is('gestionado_por', null).neq('estado_operativo', 'cerrado');
            } else if (this.vistaAsignacionActiva === 'mis_turnos') {
                qSic = qSic.eq('gestionado_por', this.usuarioActual.cedula);
                qCons = qCons.eq('gestionado_por', this.usuarioActual.cedula).neq('estado_operativo', 'cerrado');
            } else if (this.vistaAsignacionActiva === 'en_atencion') {
                qSic = qSic.not('gestionado_por', 'is', null);
                qCons = qCons.not('gestionado_por', 'is', null).neq('estado_operativo', 'cerrado');
            }

            const [resSic, resCons] = await Promise.all([qSic, qCons]);
            const counts = { pendiente_respuesta: 0, si: 0, no: 0 };
            
            if (resSic.data) {
                resSic.data.forEach(t => { if (counts[t.estado_operativo] !== undefined) counts[t.estado_operativo]++; });
            }

            const countPendientes = document.getElementById('count-pendientes');
            if (countPendientes) countPendientes.innerText = counts.pendiente_respuesta;
            
            const countSi = document.getElementById('count-si');
            if (countSi) countSi.innerText = counts.si;
            
            const countNo = document.getElementById('count-no');
            if (countNo) countNo.innerText = counts.no;

            const countConsulta = document.getElementById('count-consulta');
            if (countConsulta) countConsulta.innerText = resCons.data ? resCons.data.length : 0;

        } catch (err) {
            console.error("Error al contar:", err);
        }
    },

    configurarEventosChat() {
        const btnCerrarChat = document.getElementById('btn-cerrar-chat');
        if(btnCerrarChat) {
            btnCerrarChat.addEventListener('click', async () => {
                if (!this.turnoActivoId) return;
                
                if(confirm("¿Estás seguro de que deseas cerrar este requerimiento/consulta de forma manual?")) {
                    try {
                        const { error } = await supabaseClient
                            .from(this.obtenerTablaActual())
                            .update({ 
                                estado_operativo: 'cerrado', 
                                gestionado_por: this.usuarioActual.cedula,
                                motivo_cierre: 'gestionado' 
                            })
                            .eq('id', this.turnoActivoId);
                        if (error) throw error;

                        this.turnoActivoId = null;
                        document.getElementById('chat-activo').classList.add('hidden');
                        document.getElementById('chat-activo').classList.remove('flex');
                        document.getElementById('chat-vacio').classList.remove('hidden');
                        document.getElementById('chat-vacio').classList.add('flex');
                        
                        this.cargarBolsaComun(); 
                        this.controlarAlertasVisuales();
                    } catch (err) {
                        alert("Error al cerrar: " + err.message);
                    }
                }
            });
        }

        const inputChat = document.getElementById('chat-input');
        const btnEnviar = document.getElementById('btn-enviar-msg');

        if(inputChat && btnEnviar) {
            inputChat.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.enviarMensaje();
                }
            });
            btnEnviar.addEventListener('click', () => { this.enviarMensaje(); });
        }
    },

    configurarAccionesManuales() {
        const btnConfirmar = document.getElementById('btn-confirmar');
        const btnRechazar = document.getElementById('btn-rechazar');
        
        if(btnConfirmar) {
            btnConfirmar.addEventListener('click', () => {
                this.ejecutarAccionManual('✅ El turno fue confirmado manualmente por el coordinador.', 'si');
            });
        }

        if(btnRechazar) {
            btnRechazar.addEventListener('click', () => {
                this.ejecutarAccionManual('❌ El turno fue cancelado/rechazado manualmente por el coordinador.', 'no');
            });
        }
    },

    async ejecutarAccionManual(mensajeBase, estadoDeseado) {
        if (!this.turnoActivoId) return;

        // 1. Pedimos las observaciones en pantalla
        const accionTexto = estadoDeseado === 'si' ? 'CONFIRMACIÓN' : 'RECHAZO';
        const observacion = prompt(`📝 Observaciones para esta ${accionTexto}:\nEscribe los detalles de la gestión manual:`);
        
        if (observacion === null) return; // Si el usuario le da a "Cancelar", detenemos todo

        // Armamos el mensaje final
        const textoFinal = `${mensajeBase}\n📝 Observación: ${observacion || 'Sin detalles adicionales.'}`;

        try {
            // 2. Guardamos la observación en el chat
            await supabaseClient.from('mensajes_chat').insert([{
                requerimiento_id: this.turnoActivoId,
                tipo: 'sistema',
                autor: this.usuarioActual.nombre_completo,
                texto: textoFinal
            }]);

            // 3. 🌟 CERRAMOS EL TURNO (Y guardamos si fue un sí o no en el motivo)
            const { error } = await supabaseClient
                .from(this.obtenerTablaActual())
                .update({ 
                    estado_operativo: 'cerrado', 
                    gestionado_por: this.usuarioActual.cedula,
                    motivo_cierre: estadoDeseado === 'si' ? 'confirmado_manual' : 'rechazado_manual'
                })
                .eq('id', this.turnoActivoId);

            if (error) throw error;

            // 4. Limpiamos la pantalla
            this.turnoActivoId = null;
            document.getElementById('chat-activo').classList.add('hidden');
            document.getElementById('chat-activo').classList.remove('flex');
            document.getElementById('chat-vacio').classList.remove('hidden');
            document.getElementById('chat-vacio').classList.add('flex');
            
            this.cargarBolsaComun(); 
            this.controlarAlertasVisuales();

        } catch (err) {
            console.error("Error en gestión manual:", err);
            alert("No se pudo procesar la acción.");
        }
    },

    async registrarLlamada() {
        if (!this.turnoActivoId) return;
        
        // 1. Pedimos las observaciones de la llamada
        const observacion = prompt("📞 Registrar Llamada\n\nEscribe qué sucedió en la llamada (Ej: No contesta, Va en camino):");
        
        if (observacion === null) return; // Si le da a cancelar, no hace nada

        const textoFinal = `📞 Intento de llamada telefónica.\n📝 Observación: ${observacion || 'Sin detalles.'}`;

        try {
            // 2. Guardamos la nota en el chat
            await supabaseClient.from('mensajes_chat').insert([{
                requerimiento_id: this.turnoActivoId,
                tipo: 'sistema',
                autor: this.usuarioActual.nombre_completo,
                texto: textoFinal
            }]);
            
            // 3. PREGUNTAMOS SI QUIERE CERRAR EL TURNO YA
            if(confirm("¿Deseas dar por CERRADO este turno ahora mismo?\n(Si aceptas, desaparecerá de tus pendientes)")) {
                
                const { error } = await supabaseClient
                    .from(this.obtenerTablaActual())
                    .update({ 
                        estado_operativo: 'cerrado', 
                        gestionado_por: this.usuarioActual.cedula,
                        motivo_cierre: 'gestion_telefonica' 
                    })
                    .eq('id', this.turnoActivoId);

                if (error) throw error;

                // Limpiamos la pantalla
                this.turnoActivoId = null;
                document.getElementById('chat-activo').classList.add('hidden');
                document.getElementById('chat-activo').classList.remove('flex');
                document.getElementById('chat-vacio').classList.remove('hidden');
                document.getElementById('chat-vacio').classList.add('flex');
                
                this.cargarBolsaComun(); 
                this.controlarAlertasVisuales();
                
            } else {
                // 🌟 LA MAGIA: Si dice que NO lo quiere cerrar, nos aseguramos de asignárselo
                await supabaseClient
                    .from(this.obtenerTablaActual())
                    .update({ 
                        gestionado_por: this.usuarioActual.cedula
                    })
                    .eq('id', this.turnoActivoId)
                    .is('gestionado_por', null); // Solo lo actualiza si nadie más lo tenía

                // Recargamos el chat para ver la nota y lo mandamos a su bolsa personal
                this.cargarMensajes(this.turnoActivoId);
                
                if (this.vistaAsignacionActiva === 'comun') {
                    this.cambiarVistaBolsa('mis_turnos');
                } else {
                    this.cargarBolsaComun(true); 
                }
            }
            
        } catch (err) {
            console.error("Error al registrar la llamada:", err);
            alert("No se pudo registrar la llamada.");
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
            const { error } = await supabaseClient.from('mensajes_chat').insert([nuevoMensaje]);
            if (error) throw error;

            if (this.vistaAsignacionActiva === 'comun') {
                await supabaseClient.from(this.obtenerTablaActual())
                    .update({ 
                        gestionado_por: this.usuarioActual.cedula
                    })
                    .eq('id', this.turnoActivoId)
                    .is('gestionado_por', null);
                
                this.cambiarVistaBolsa('mis_turnos');
            }


        } catch (err) {
            console.error("Error enviando:", err);
        }
    },

    async cargarBolsaComun(silencioso = false) {
        this.actualizarContadores();
        const contenedor = document.getElementById('lista-turnos-container');
        const searchVal = document.getElementById('search-input') ? document.getElementById('search-input').value.trim() : '';
        
        if(!silencioso) {
            contenedor.innerHTML = '<div class="p-6 text-center text-slate-500"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>Cargando...</p></div>';
        }

        try {
            let data = [];

            if (this.estadoFiltroActivo === 'cerrado') {
                // 🌟 LÓGICA DE FUSIÓN: Traemos los cerrados de AMBAS tablas
                let qSic = supabaseClient.from('requerimientos_turnos_sic').select('*').eq('estado_operativo', 'cerrado').order('created_at', { ascending: false }).limit(30);
                let qCons = supabaseClient.from('consultas_generales').select('*').eq('estado_operativo', 'cerrado').order('created_at', { ascending: false }).limit(30);
                
                if (searchVal) {
                    qSic = qSic.or(`nombre.ilike.%${searchVal}%,apellido.ilike.%${searchVal}%,cedula.ilike.%${searchVal}%,celular.ilike.%${searchVal}%,codigo_requerimiento.ilike.%${searchVal}%`);
                    qCons = qCons.or(`nombres_completos.ilike.%${searchVal}%,telefono.ilike.%${searchVal}%,numero_requerimiento.ilike.%${searchVal}%`);
                }

                if (this.vistaAsignacionActiva === 'mis_turnos') {
                    qSic = qSic.eq('gestionado_por', this.usuarioActual.cedula);
                    qCons = qCons.eq('gestionado_por', this.usuarioActual.cedula);
                } else if (this.vistaAsignacionActiva === 'en_atencion') {
                    qSic = qSic.not('gestionado_por', 'is', null);
                    qCons = qCons.not('gestionado_por', 'is', null);
                }

                const [resSic, resCons] = await Promise.all([qSic, qCons]);
                if (resSic.error) throw resSic.error;
                if (resCons.error) throw resCons.error;
                
                // Unimos ambas listas y las ordenamos de más reciente a más antiguo
                data = [...resSic.data, ...resCons.data];
                data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                data = data.slice(0, 30); // Mostramos solo los últimos 30 en total

            } else {
                // 🌟 LÓGICA NORMAL: Buscar solo en la tabla activa
                const tablaActual = this.obtenerTablaActual();
                let query = supabaseClient.from(tablaActual)
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(30); 
                
                if (this.estadoFiltroActivo === 'consulta') {
                    query = query.neq('estado_operativo', 'cerrado'); 
                } else {
                    query = query.eq('estado_operativo', this.estadoFiltroActivo);
                }

                if (this.vistaAsignacionActiva === 'comun') {
                    query = query.is('gestionado_por', null);
                } else if (this.vistaAsignacionActiva === 'mis_turnos') {
                    query = query.eq('gestionado_por', this.usuarioActual.cedula);
                } else if (this.vistaAsignacionActiva === 'en_atencion') {
                    query = query.not('gestionado_por', 'is', null);
                }

                if (searchVal) {
                    if (tablaActual === 'requerimientos_turnos_sic') {
                        query = query.or(`nombre.ilike.%${searchVal}%,apellido.ilike.%${searchVal}%,cedula.ilike.%${searchVal}%,celular.ilike.%${searchVal}%,codigo_requerimiento.ilike.%${searchVal}%`);
                    } else {
                        query = query.or(`nombres_completos.ilike.%${searchVal}%,telefono.ilike.%${searchVal}%,numero_requerimiento.ilike.%${searchVal}%`);
                    }
                }

                const result = await query;
                if (result.error) throw result.error;
                data = result.data;
            }

            contenedor.innerHTML = ''; 

            if (data.length === 0) {
                contenedor.innerHTML = `<div class="p-8 text-center text-slate-400"><i class="fas fa-inbox text-4xl mb-3 text-slate-200"></i><p class="text-sm">No hay registros coincidentes.</p></div>`;
                return;
            }

            data.forEach(turno => {
                const tarjeta = document.createElement('div');
                tarjeta.setAttribute('data-id', turno.id);
                tarjeta.className = 'p-4 border-b hover:bg-slate-50 cursor-pointer border-l-4 transition-all relative';
                
                if(this.turnoActivoId === turno.id) {
                    tarjeta.classList.add('bg-slate-100');
                }

                if(turno.estado_operativo === 'pendiente_respuesta') tarjeta.classList.add('border-amber-400');
                if(turno.estado_operativo === 'si') tarjeta.classList.add('border-emerald-500');
                if(turno.estado_operativo === 'no') tarjeta.classList.add('border-rose-500');
                if(turno.estado_operativo === 'consulta') tarjeta.classList.add('border-[#0085CA]');
                if(turno.estado_operativo === 'cerrado') tarjeta.classList.add('border-slate-500', 'bg-slate-50', 'opacity-70');

                const horaLocal = new Date(turno.created_at).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });

                let badgeGestor = '';
                if (this.vistaAsignacionActiva === 'en_atencion' && turno.gestionado_por) {
                    const nombreGestor = this.diccionarioUsuarios[turno.gestionado_por] || turno.gestionado_por;
                    badgeGestor = `<div class="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded shadow-sm font-bold truncate max-w-[120px]" title="${nombreGestor}"><i class="fas fa-headset mr-1"></i> ${nombreGestor}</div>`;
                }

                let badgeWhatsApp = '';
                if (turno.numero_requerimiento) { // Si tiene esta columna, sabemos que es de Consultas Generales
                    badgeWhatsApp = `<span class="text-blue-500 font-bold text-[11px]"><i class="fas fa-info-circle"></i> Soporte Interno</span>`;
                } else if (turno.whatsapp_enviado) {
                    badgeWhatsApp = `<span class="text-emerald-500 font-bold text-[11px]"><i class="fab fa-whatsapp"></i> Notificado</span>`;
                } else {
                    badgeWhatsApp = `<span class="text-slate-400 font-medium text-[11px]"><i class="fab fa-whatsapp opacity-30"></i> Sin enviar</span>`;
                }

                const nombreCompleto = turno.nombres_completos || `${turno.nombre || ''} ${turno.apellido || ''}`.trim() || 'Desconocido';
                const idMostrar = turno.numero_requerimiento || turno.codigo_requerimiento || turno.id_asignacion || 'N/A';

                tarjeta.innerHTML = `
                    ${badgeGestor}
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-slate-800 text-sm uppercase pr-16">${nombreCompleto}</h4>
                    </div>
                    <p class="text-xs text-slate-500 mt-1">Req: <span class="font-bold font-mono">${idMostrar}</span></p>
                    <div class="mt-2 flex justify-between items-center">
                        ${badgeWhatsApp}
                        <span class="text-xs text-slate-400 font-medium">${horaLocal}</span>
                    </div>
                `;

                tarjeta.addEventListener('click', () => {
                    tarjeta.classList.remove('animate-pulse', 'border-rose-500', 'bg-rose-50', 'border-l-8');
                    const titulo = tarjeta.querySelector('h4');
                    if (titulo) titulo.innerHTML = titulo.innerHTML.replace('<i class="fas fa-bell text-rose-500 mr-1"></i> ', '');
                    
                    this.abrirChat(turno);
                    const todas = document.querySelectorAll('#lista-turnos-container > div');
                    todas.forEach(t => t.classList.remove('bg-slate-100'));
                    tarjeta.classList.add('bg-slate-100');
                });

                contenedor.appendChild(tarjeta);
            });

        } catch (err) {
            console.error('Error:', err);
            contenedor.innerHTML = '<div class="p-4 text-center text-rose-500 text-sm">Error de conexión.</div>';
        }
    },

    abrirChat(turno) {
        // 1. MEMORIA DEL SISTEMA
        this.turnoActivoDatos = turno;
        this.turnoActivoId = turno.id;
        this.turnoActivoTelefono = turno.telefono || turno.celular; 
        this.turnoActivoTabla = turno.numero_requerimiento ? 'consultas_generales' : 'requerimientos_turnos_sic';

        // 2. CAMBIO VISUAL
        const vistaVacia = document.getElementById('chat-vacio');
        const vistaActiva = document.getElementById('chat-activo');
        if (vistaVacia) vistaVacia.classList.add('hidden');
        if (vistaActiva) {
            vistaActiva.classList.remove('hidden');
            vistaActiva.classList.add('flex');
        }

        if (window.innerWidth < 768) {
            const listaCol = document.getElementById('lista-turnos-col');
            if (listaCol) listaCol.classList.add('hidden');
        }

        // 3. ENCABEZADO
        const nombreCompleto = turno.nombres_completos || `${turno.nombre || ''} ${turno.apellido || ''}`.trim() || 'Desconocido';
        const idMostrar = turno.numero_requerimiento || turno.codigo_requerimiento || turno.id_asignacion || 'N/A';
        
        const nombreEl = document.getElementById('chat-header-nombre');
        const reqEl = document.getElementById('chat-header-req');
        if (nombreEl) nombreEl.innerText = nombreCompleto;
        if (reqEl) reqEl.innerText = idMostrar;

        // 4. LÓGICA DE ESTADOS Y LIMPIEZA VISUAL
        const areaInput = document.getElementById('area-escritura');
        const contenedorBotones = document.getElementById('panel-acciones-manuales');
        const btnConfirmar = document.getElementById('btn-confirmar');
        const btnRechazar = document.getElementById('btn-rechazar');
        const btnLlamar = document.getElementById('btn-llamar');
        const franjaDetalles = document.getElementById('franja-detalles-turno');
        const avisoMeta = document.getElementById('aviso-meta');
        
        // 🌟 NUEVO: Capturamos el contenedor de respuestas rápidas
        const containerRespuestas = document.getElementById('container-respuestas-rapidas');

        // Primero, ENCENDEMOS todo a su estado natural (reset visual)
        if (franjaDetalles) franjaDetalles.classList.remove('hidden');
        if (btnLlamar) btnLlamar.classList.remove('hidden');
        if (contenedorBotones) {
            contenedorBotones.classList.remove('hidden');
            contenedorBotones.classList.add('flex');
        }
        if (btnConfirmar) btnConfirmar.classList.remove('hidden');
        if (btnRechazar) btnRechazar.classList.remove('hidden');
        if (areaInput) {
            areaInput.classList.remove('hidden');
            areaInput.classList.add('flex');
        }
        if (avisoMeta) avisoMeta.classList.add('hidden'); 
        
        // Apagamos las respuestas rápidas por defecto
        if (containerRespuestas) {
            containerRespuestas.classList.add('hidden');
            containerRespuestas.classList.remove('flex');
        }

        // Ahora evaluamos las reglas
        if (turno.estado_operativo === 'cerrado') {
            if (contenedorBotones) {
                contenedorBotones.classList.add('hidden');
                contenedorBotones.classList.remove('flex');
            }
            if (areaInput) {
                areaInput.classList.add('hidden');
                areaInput.classList.remove('flex');
            }
        } 
        else if (this.turnoActivoTabla === 'consultas_generales' || turno.estado_operativo === 'consulta') {
            // 🛑 CONSULTAS: Ocultamos botones, PERO ENCENDEMOS respuestas rápidas
            if (contenedorBotones) {
                contenedorBotones.classList.add('hidden');
                contenedorBotones.classList.remove('flex');
            }
            if (franjaDetalles) franjaDetalles.classList.add('hidden'); 
            
            // 🌟 Activamos el menú de respuestas rápidas
            if (containerRespuestas) {
                containerRespuestas.classList.remove('hidden');
                containerRespuestas.classList.add('flex'); 
            }
        } 
        else if (turno.estado_operativo === 'pendiente_respuesta') {
            if (areaInput) {
                areaInput.classList.add('hidden');
                areaInput.classList.remove('flex');
            }
        } 
        else {
            if (contenedorBotones) {
                contenedorBotones.classList.add('hidden');
                contenedorBotones.classList.remove('flex');
            }
            if (areaInput) {
                areaInput.classList.add('hidden');
                areaInput.classList.remove('flex');
            }
            if (avisoMeta) avisoMeta.classList.remove('hidden'); 
        }

        // 5. CARGA FINAL
        this.cargarMensajes(turno.id);
    },

    async reabrirChatSi() {
        if (!this.turnoActivoId) return;
        try {
            const { data: turno, error: errorTurno } = await supabaseClient
                .from('requerimientos_turnos_sic')
                .select('*')
                .eq('id', this.turnoActivoId)
                .single();
                
            if (errorTurno) throw errorTurno;
            
            const { data: mensajes, error: errorMsg } = await supabaseClient
                .from('mensajes_chat')
                .select('hora_registro')
                .eq('requerimiento_id', this.turnoActivoId)
                .order('hora_registro', { ascending: false })
                .limit(1);
                
            if (errorMsg) throw errorMsg;
            
            let ultimaInteraccion = new Date(turno.created_at);
            if (mensajes && mensajes.length > 0) {
                ultimaInteraccion = new Date(mensajes[0].hora_registro);
            }
            
            const ahora = new Date();
            const diferenciaHoras = (ahora - ultimaInteraccion) / (1000 * 60 * 60);
            
            if (diferenciaHoras <= 20) {
                document.getElementById('panel-reabrir-si').classList.add('hidden');
                document.getElementById('area-escritura').classList.remove('hidden');
                document.getElementById('area-escritura').classList.add('flex');
                
                const rpContainer = document.getElementById('container-respuestas-rapidas');
                if (rpContainer) rpContainer.classList.remove('hidden');
                
                alert("🔓 Conversación habilitada temporalmente. Estás dentro de la ventana de 20 horas de Meta.");
            } else {
                alert("❌ Bloqueo de seguridad: Se han superado las 20 horas desde el último contacto con este operario. No es seguro escribirle directamente.");
            }
        } catch (err) {
            console.error("Error al reabrir chat:", err);
        }
    },

    async cargarMensajes(requerimientoId) {
        const contenedor = document.getElementById('contenedor-mensajes');
        contenedor.innerHTML = '<div class="text-center text-slate-400 mt-10"><i class="fas fa-spinner fa-spin text-xl"></i> Cargando chat...</div>';

        try {
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

            const mensajesOrdenados = data.reverse();
            mensajesOrdenados.forEach(msg => {
                this.pintarBurbuja(msg.tipo, msg.autor, msg.texto, msg.hora_registro);
            });

        } catch (err) {
            contenedor.innerHTML = '<div class="text-center text-rose-500 mt-10 text-sm">Error cargando chat.</div>';
        }
    },

    pintarBurbuja(tipo, autor, texto, horaRaw) {
        const contenedor = document.getElementById('contenedor-mensajes');
        if(contenedor.innerHTML.includes('No hay mensajes')) contenedor.innerHTML = '';

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
            // Calculamos la fecha y hora completas (Ej: 14/07/2026, 09:57 a. m.)
            const fechaHoraCompleta = new Date(horaRaw).toLocaleString('es-CO', { 
                timeZone: 'America/Bogota', 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit' 
            });

            div.className = 'flex justify-center relative z-10 my-2';
            div.innerHTML = `
                <div class="bg-blue-50 text-blue-800 text-[10px] md:text-xs px-4 py-2.5 rounded-xl border border-blue-200 text-left font-medium shadow-sm max-w-[85%] md:max-w-md">
                    <div class="text-[9px] text-blue-600 font-bold uppercase tracking-wide mb-1 border-b border-blue-200 pb-1 flex justify-between items-center gap-4">
                        <span><i class="fas fa-user-shield mr-1"></i> GESTIÓN: ${autor}</span>
                    </div>
                    <p class="mt-1.5 leading-relaxed whitespace-pre-wrap"><i class="fas fa-info-circle mr-1"></i> ${texto}</p>
                    <span class="text-[9px] text-blue-500 mt-2 block text-right font-bold">${fechaHoraCompleta}</span>
                </div>`;
        }

        contenedor.appendChild(div);
        const zonaChat = document.querySelector('#section-chat .overflow-y-auto');
        if (zonaChat) zonaChat.scrollTop = zonaChat.scrollHeight;
    },
    
    async cargarUsuarios() {
        const contenedor = document.getElementById('lista-usuarios-container');
        if(!contenedor) return;
        
        contenedor.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>Cargando usuarios...</td></tr>';

        try {
            const { data, error } = await supabaseClient
                .from('usuarios_plataforma')
                .select('*')
                .eq('estado', 'activo') // 🌟 ESTA ES LA LÍNEA MÁGICA
                .order('nombre_completo', { ascending: true });

            if (error) throw error;
            contenedor.innerHTML = '';

            data.forEach(user => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-slate-50 transition-colors';
                const badgeColor = user.rol === 'administrador' ? 'bg-[#0085CA] text-white' : 'bg-[#8DC63F] text-white';
                
                tr.innerHTML = `
                    <td class="px-6 py-4 font-bold text-slate-700">${user.nombre_completo}</td>
                    <td class="px-6 py-4 font-mono text-xs text-slate-500">${user.cedula}</td>
                    <td class="px-6 py-4"><span class="px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider font-bold ${badgeColor}">${user.rol}</span></td>
                    <td class="px-6 py-4 text-center space-x-2">
                        <button id="btn-reset-${user.cedula}" onclick="App.resetearPasswordUsuario('${user.cedula}', '${user.nombre_completo}')" class="text-amber-500 hover:bg-amber-50 p-2 rounded-lg transition-colors"><i class="fas fa-key"></i></button>
                        <button onclick="App.eliminarUsuario('${user.cedula}', '${user.nombre_completo}')" class="text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-colors"><i class="fas fa-trash-alt"></i></button>
                    </td>
                `;
                contenedor.appendChild(tr);
            });
        } catch (err) {
            console.error("Error:", err);
        }
    },

    abrirModalUsuario() {
        const formUsuario = document.getElementById('form-usuario');
        if(formUsuario) formUsuario.reset();
        const modal = document.getElementById('modal-usuario');
        const content = document.getElementById('modal-usuario-content');
        if(modal && content) {
            modal.classList.remove('hidden');
            setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);
        }
    },

    cerrarModalUsuario() {
        const modal = document.getElementById('modal-usuario');
        const content = document.getElementById('modal-usuario-content');
        if(modal && content) {
            modal.classList.add('opacity-0'); content.classList.add('scale-95');
            setTimeout(() => { modal.classList.add('hidden'); }, 300);
        }
    },

    async guardarNuevoUsuario(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-guardar-usuario');
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Creando...'; btn.disabled = true;

        const nuevoNombre = document.getElementById('nuevo-nombre').value.trim();
        const nuevaCedula = document.getElementById('nuevo-usuario').value.trim();
        const nuevaPassword = document.getElementById('nueva-password').value;
        const nuevoRol = document.getElementById('nuevo-rol').value;

        try {
            // Dejamos la orden en el buzón seguro de Supabase
            const { error } = await supabaseClient.from('peticiones_usuarios').insert([{
                accion: 'crear',
                nombre: nuevoNombre,
                cedula: nuevaCedula,
                password: nuevaPassword,
                rol: nuevoRol
            }]);
            
            if (error) throw error;
            
            this.cerrarModalUsuario(); 
            this.cargarUsuarios(); 
            this.cargarDiccionarioUsuarios();
            alert("✅ Orden de creación enviada con éxito.");
        } catch (err) {
            console.error(err);
            alert("❌ Error al enviar la orden a la base de datos.");
        } finally {
            btn.innerHTML = textoOriginal; btn.disabled = false;
        }
    },

    async resetearPasswordUsuario(cedula, nombre) {
        const nuevaPassword = prompt(`🔑 Resetear contraseña de ${nombre}\n\nIngresa la NUEVA contraseña:`);
        if (!nuevaPassword || nuevaPassword.length < 6) return alert("Mínimo 6 caracteres.");

        const btn = document.getElementById(`btn-reset-${cedula}`);
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            // Dejamos la orden en el buzón seguro de Supabase
            const { error } = await supabaseClient.from('peticiones_usuarios').insert([{
                accion: 'resetear',
                cedula: cedula,
                password: nuevaPassword
            }]);
            
            if (error) throw error;
            alert(`✅ Orden de cambio de contraseña enviada. Los cambios pueden tardar unos segundos.`);
        } catch(err) {
            console.error(err);
            alert("❌ Error de conexión con la base de datos.");
        } finally {
            if(btn) btn.innerHTML = '<i class="fas fa-key"></i>';
        }
    },

    async eliminarUsuario(cedula, nombre) {
        if(!confirm(`⚠️ ¿Estás totalmente seguro de eliminar el acceso a ${nombre}?`)) return;

        try {
            // Dejamos la orden en el buzón seguro de Supabase
            const { error } = await supabaseClient.from('peticiones_usuarios').insert([{
                accion: 'eliminar',
                cedula: cedula
            }]);
            
            if (error) throw error;
            
            // Recargamos la lista visualmente
            this.cargarUsuarios(); 
            this.cargarDiccionarioUsuarios();
            alert(`✅ Orden de eliminación enviada al servidor.`);
        } catch (err) {
            console.error(err);
            alert("❌ Error al enviar la orden de eliminación.");
        }
    },

    async cargarRespuestasRapidas() {
        try {
            const { data, error } = await supabaseClient
                .from('respuestas_rapidas')
                .select('*')
                .order('created_at', { ascending: true });
                
            if (error) return console.warn("Respuestas rápidas no configuradas.");
            
            const select = document.getElementById('select-respuestas-rapidas');
            if (select) {
                select.innerHTML = '<option value="">-- Selecciona una respuesta rápida --</option>';
                data.forEach(resp => {
                    const opt = document.createElement('option');
                    // El value sigue siendo el cuerpo para inyectarlo fácil al chat
                    opt.value = resp.texto; 
                    // El title es el nativo de HTML que muestra el globito al pasar el mouse
                    opt.title = resp.texto; 
                    // El innerText es lo que lee el usuario en la lista desplegable
                    const tituloBase = resp.titulo || "Sin título";
                    opt.innerText = tituloBase.length > 55 ? tituloBase.substring(0, 55) + '...' : tituloBase;
                    
                    select.appendChild(opt);
                });
            }
            
            const contenedorAdmin = document.getElementById('lista-respuestas-rapidas-container');
            if (contenedorAdmin) {
                contenedorAdmin.innerHTML = '';
                if (data.length === 0) {
                    contenedorAdmin.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">No hay mensajes configurados.</div>';
                    return;
                }
                data.forEach(resp => {
                    const div = document.createElement('div');
                    div.className = 'p-3 flex justify-between items-center text-xs text-slate-700 bg-white hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0';
                    const tituloBase = resp.titulo || "Sin título";
                    
                    // Diseño mejorado para mostrar el título en negrita y el cuerpo atenuado abajo
                    div.innerHTML = `
                        <div class="flex-1 pr-4 break-words">
                            <span class="font-bold text-slate-800 block mb-0.5">${tituloBase}</span>
                            <span class="text-slate-500 line-clamp-1">${resp.texto}</span>
                        </div>
                        <button onclick="App.eliminarRespuestaRapida('${resp.id}')" class="text-rose-500 p-2 hover:bg-rose-50 rounded transition-colors"><i class="fas fa-trash-alt"></i></button>
                    `;
                    contenedorAdmin.appendChild(div);
                });
            }
        } catch (err) {
            console.error("Error cargando mensajes rápidos:", err);
        }
    },

    async guardarRespuestaRapida() {
        const inputTitulo = document.getElementById('nuevo-titulo-rapida');
        const inputTexto = document.getElementById('nueva-respuesta-rapida');
        
        if (!inputTitulo || !inputTexto) return;
        
        const titulo = inputTitulo.value.trim();
        const texto = inputTexto.value.trim();
        
        if (!titulo || !texto) return alert("Por favor, ingresa tanto el Título como el Cuerpo del mensaje.");
        
        try {
            // Guardamos ambos valores en Supabase
            const { error } = await supabaseClient.from('respuestas_rapidas').insert([{ 
                titulo: titulo, 
                texto: texto 
            }]);
            
            if (error) throw error;
            
            inputTitulo.value = '';
            inputTexto.value = '';
            this.cargarRespuestasRapidas();
            alert("✅ Respuesta guardada con éxito.");
        } catch (err) {
            console.error(err);
            alert("❌ Error al guardar. Confirma que creaste la columna 'titulo' en Supabase.");
        }
    },

    async eliminarRespuestaRapida(id) {
        if (!confirm("¿Deseas eliminar esta respuesta rápida?")) return;
        try {
            const { error } = await supabaseClient.from('respuestas_rapidas').delete().eq('id', id);
            if (error) throw error;
            this.cargarRespuestasRapidas();
        } catch (err) {
            console.error(err);
        }
    },

    seleccionarRespuestaRapida() {
        const select = document.getElementById('select-respuestas-rapidas');
        const inputChat = document.getElementById('chat-input');
        if (!select || !inputChat || !select.value) return;
        
        let textoInyectado = select.value;
        if (this.usuarioActual && this.usuarioActual.nombre_completo) {
            textoInyectado = textoInyectado.replace(/{coordinador}/g, this.usuarioActual.nombre_completo);
        }
        
        inputChat.value = textoInyectado;
        select.value = ""; 
        inputChat.focus();
    },

    async controlarAlertasVisuales() {
        if (!this.usuarioActual) return;
        try {
            // Contamos los pendientes del SIC de forma exacta
            const qSic = supabaseClient
                .from('requerimientos_turnos_sic')
                .select('id')
                .eq('gestionado_por', this.usuarioActual.cedula)
                .neq('estado_operativo', 'cerrado');
                
            // Contamos los pendientes de Consultas de forma exacta
            const qCons = supabaseClient
                .from('consultas_generales')
                .select('id')
                .eq('gestionado_por', this.usuarioActual.cedula)
                .neq('estado_operativo', 'cerrado');

            const [resSic, resCons] = await Promise.all([qSic, qCons]);
            
            // Sumamos los resultados reales
            const countSic = resSic.data ? resSic.data.length : 0;
            const countCons = resCons.data ? resCons.data.length : 0;
            const totalCount = countSic + countCons;

            const banner = document.getElementById('banner-alerta-turnos');
            const badge = document.getElementById('badge-mis-turnos');
            const tabMisTurnos = document.getElementById('tab-mis-turnos');
            
            if (totalCount > 0) {
                if (banner) banner.classList.remove('hidden');
                if (badge) { badge.innerText = totalCount; badge.classList.remove('hidden'); }
                if (tabMisTurnos) { tabMisTurnos.classList.add('border-rose-500', 'text-rose-600'); tabMisTurnos.classList.remove('border-slate-200'); }
            } else {
                if (banner) banner.classList.add('hidden');
                if (badge) badge.classList.add('hidden');
                if (tabMisTurnos) {
                    tabMisTurnos.classList.remove('border-rose-500', 'text-rose-600');
                    if (this.vistaAsignacionActiva !== 'mis_turnos') tabMisTurnos.classList.add('border-slate-200');
                }
            }
        } catch(err) {
            console.error("Error cargando alertas:", err);
        }
    },

    async cargarConfiguracionTiempo() {
        try {
            const { data, error } = await supabaseClient
                .from('configuracion_global')
                .select('valor')
                .eq('parametro', 'horas_limite_chat')
                .single();
            if (error) throw error;
            if(data) {
                const minutosTotales = parseInt(data.valor) || 0;
                const horas = Math.floor(minutosTotales / 60);
                const minutosRestantes = minutosTotales % 60;
                document.getElementById('config-horas').value = horas;
                document.getElementById('config-minutos').value = minutosRestantes;
            }
        } catch (err) {
            console.error(err);
        }
    },

    async guardarConfiguracionTiempo() {
        const inputHoras = parseInt(document.getElementById('config-horas').value) || 0;
        const inputMinutos = parseInt(document.getElementById('config-minutos').value) || 0;
        if(inputHoras === 0 && inputMinutos === 0) return alert("No puede ser cero.");

        const minutosTotales = (inputHoras * 60) + inputMinutos;
        const btn = document.getElementById('btn-guardar-tiempo');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const { error } = await supabaseClient
                .from('configuracion_global')
                .update({ valor: minutosTotales })
                .eq('parametro', 'horas_limite_chat');
            if (error) throw error;
            alert(`✅ Tiempo actualizado a ${inputHoras}h y ${inputMinutos}m.`);
        } catch (err) {
            alert("❌ Error.");
        } finally {
            btn.innerHTML = 'Guardar';
        }
    },

    async cargarConfiguracionMensajesAuto() {
        try {
            const { data, error } = await supabaseClient
                .from('configuracion_global')
                .select('parametro, valor')
                .in('parametro', ['mensaje_auto_si', 'mensaje_auto_no']);
                
            if (error) throw error;
            
            // Si encuentra los mensajes, los pinta en los textarea
            if (data) {
                data.forEach(item => {
                    if (item.parametro === 'mensaje_auto_si') document.getElementById('config-msg-si').value = item.valor;
                    if (item.parametro === 'mensaje_auto_no') document.getElementById('config-msg-no').value = item.valor;
                });
            }
        } catch (err) {
            console.error("Error cargando mensajes automáticos:", err);
        }
    },

    async guardarMensajeAuto(tipo) {
        const inputId = tipo === 'si' ? 'config-msg-si' : 'config-msg-no';
        const parametro = tipo === 'si' ? 'mensaje_auto_si' : 'mensaje_auto_no';
        const valor = document.getElementById(inputId).value.trim();
        const btn = document.getElementById(`btn-guardar-msg-${tipo}`);
        
        if (!valor) return alert("El mensaje no puede estar vacío.");

        const textoOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            // 1. Verificamos si el parámetro ya existe en la base de datos
            const { data: existente } = await supabaseClient
                .from('configuracion_global')
                .select('id')
                .eq('parametro', parametro)
                .maybeSingle();
            
            // 2. Si existe lo actualizamos, si no, lo insertamos nuevo
            if (existente) {
                const { error } = await supabaseClient.from('configuracion_global').update({ valor }).eq('id', existente.id);
                if (error) throw error;
            } else {
                const { error } = await supabaseClient.from('configuracion_global').insert([{ parametro: parametro, valor: valor }]);
                if (error) throw error;
            }
            
            alert("✅ Mensaje automático guardado correctamente.");
        } catch (err) {
            console.error(err);
            alert("❌ Error al guardar el mensaje en la base de datos.");
        } finally {
            btn.innerHTML = textoOriginal;
        }
    },

    mostrarInfoTurno() {
        if (!this.turnoActivoDatos) return;
        const turno = this.turnoActivoDatos;
        const contenedor = document.getElementById('contenido-info-turno');
        
        let html = '<ul class="divide-y divide-slate-100">';
        
        // Recorremos absolutamente todos los datos que traiga la fila de la base de datos
        for (const [llave, valor] of Object.entries(turno)) {
            // Solo mostramos los campos que tengan información (ignoramos nulos o vacíos)
            if (valor !== null && valor !== '') {
                // Formateamos el nombre de la columna: quitamos guiones bajos y ponemos mayúsculas
                const etiquetaFormateada = llave.replace(/_/g, ' ').toUpperCase();
                
                html += `
                    <li class="py-2.5 flex flex-col">
                        <span class="text-[10px] font-bold text-slate-400 tracking-wide">${etiquetaFormateada}</span>
                        <span class="text-slate-800 font-medium break-words">${valor}</span>
                    </li>`;
            }
        }
        
        html += '</ul>';
        contenedor.innerHTML = html;

        const modal = document.getElementById('modal-info-turno');
        const content = document.getElementById('modal-info-content');
        if(modal && content) {
            modal.classList.remove('hidden');
            setTimeout(() => { modal.classList.remove('opacity-0'); content.classList.remove('scale-95'); }, 10);
        }
    },

    cerrarInfoTurno() {
        const modal = document.getElementById('modal-info-turno');
        const content = document.getElementById('modal-info-content');
        if(modal && content) {
            modal.classList.add('opacity-0'); content.classList.add('scale-95');
            setTimeout(() => { modal.classList.add('hidden'); }, 300);
        }
    },
};

document.addEventListener('DOMContentLoaded', () => { App.init(); });