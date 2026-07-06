// app.js - Director de Orquesta Completo Mapeado al SIC (SaberBot)

const App = {
    usuarioActual: null,
    vistaAsignacionActiva: 'comun', // comun | mis_turnos | en_atencion
    estadoFiltroActivo: 'pendiente_respuesta',
    turnoActivoId: null,
    turnoActivoTelefono: null, 
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
            this.cargarRespuestasRapidas(); // Carga de mensajes rápidos
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
            // MIGRADO: Escuchador en tiempo real apunta a la tabla del SIC
            .on('postgres_changes', { event: '*', schema: 'public', table: 'requerimientos_turnos_sic' }, payload => {
                this.actualizarContadores();
                this.controlarAlertasVisuales();
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
                    
                    if(targetId === 'view-usuarios') {
                        App.cargarUsuarios();
                        App.cargarRespuestasRapidas();
                        App.cargarConfiguracionTiempo();
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

                this.estadoFiltroActivo = filtroId;
                this.cargarBolsaComun(); 
            });
        });
    },

    // MIGRADO: Conteo Inteligente y adaptativo sobre la tabla del SIC
    async actualizarContadores() {
        try {
            let query = supabaseClient.from('requerimientos_turnos_sic').select('estado_operativo');

            if (this.vistaAsignacionActiva === 'comun') {
                query = query.is('clear', null).is('gestionado_por', null);
            } else if (this.vistaAsignacionActiva === 'mis_turnos') {
                query = query.eq('gestionado_por', this.usuarioActual.cedula);
            } else if (this.vistaAsignacionActiva === 'en_atencion') {
                query = query.not('gestionado_por', 'is', null);
            }

            const { data, error } = await query;
            if (error) throw error;

            const counts = { pendiente_respuesta: 0, consulta: 0, si: 0, no: 0 };
            data.forEach(t => {
                if (counts[t.estado_operativo] !== undefined) counts[t.estado_operativo]++;
            });

            const countPendientes = document.getElementById('count-pendientes');
            if (countPendientes) countPendientes.innerText = counts.pendiente_respuesta;
            
            const countConsulta = document.getElementById('count-consulta');
            if (countConsulta) countConsulta.innerText = counts.consulta;
            
            const countSi = document.getElementById('count-si');
            if (countSi) countSi.innerText = counts.si;
            
            const countNo = document.getElementById('count-no');
            if (countNo) countNo.innerText = counts.no;

        } catch (err) {
            console.error("Error al contar turnos:", err);
        }
    },

    configurarEventosChat() {
        const btnCerrarChat = document.getElementById('btn-cerrar-chat');
        if(btnCerrarChat) {
            btnCerrarChat.addEventListener('click', async () => {
                if (!this.turnoActivoId) return;
                
                if(confirm("¿Estás seguro de que deseas cerrar este requerimiento de forma manual?")) {
                    try {
                        const { error } = await supabaseClient
                            .from('requerimientos_turnos_sic')
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

    async ejecutarAccionManual(mensajeSistema, estadoDeseado) {
        if (!this.turnoActivoId) return;

        if(!confirm("Esta acción archivará el turno inmediatamente. ¿Deseas continuar?")) return;

        try {
            await supabaseClient.from('mensajes_chat').insert([{
                requerimiento_id: this.turnoActivoId,
                tipo: 'sistema',
                autor: this.usuarioActual.nombre_completo,
                texto: mensajeSistema
            }]);

            const { error } = await supabaseClient
                .from('requerimientos_turnos_sic')
                .update({ 
                    estado_operativo: estadoDeseado, // Guardamos estado nativo (ej: si)
                    gestionado_por: this.usuarioActual.cedula,
                    motivo_cierre: estadoDeseado 
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
            console.error("Error en gestión manual:", err);
            alert("No se pudo procesar la acción.");
        }
    },

    async registrarLlamada() {
        if (!this.turnoActivoId) return;
        if(!confirm("¿Deseas registrar un intento de llamada en la trazabilidad de este requerimiento?")) return;

        try {
            await supabaseClient.from('mensajes_chat').insert([{
                requerimiento_id: this.turnoActivoId,
                tipo: 'sistema',
                autor: this.usuarioActual.nombre_completo,
                texto: '📞 El coordinador intentó contactar al operario mediante llamada telefónica.'
            }]);
            
            this.cargarMensajes(this.turnoActivoId);
            
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
                await supabaseClient.from('requerimientos_turnos_sic')
                    .update({ 
                        gestionado_por: this.usuarioActual.cedula,
                        estado_operativo: 'consulta'
                    })
                    .eq('id', this.turnoActivoId)
                    .is('gestionado_por', null);
                
                this.cambiarVistaBolsa('mis_turnos');
            }

            await fetch('https://n8n.casalimpia.com/webhook/respuesta-coordinador', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer MiClaveSecreta2026'
                },
                body: JSON.stringify({
                    telefono: this.turnoActivoTelefono,
                    texto: texto
                })
            });

        } catch (err) {
            console.error("Error enviando:", err);
        }
    },

    // MIGRADO: Motor con Buscador Inteligente Multi-parámetro integrado (Punto 3)
    async cargarBolsaComun(silencioso = false) {
        this.actualizarContadores();
        const contenedor = document.getElementById('lista-turnos-container');
        const searchVal = document.getElementById('search-input') ? document.getElementById('search-input').value.trim() : '';
        
        if(!silencioso) {
            contenedor.innerHTML = '<div class="p-6 text-center text-slate-500"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p>Cargando...</p></div>';
        }

        try {
            let query = supabaseClient.from('requerimientos_turnos_sic')
                .select('*')
                .eq('estado_operativo', this.estadoFiltroActivo)
                .order('created_at', { ascending: false })
                .limit(30); 

            if (this.estadoFiltroActivo !== 'cerrado') {
                if (this.vistaAsignacionActiva === 'comun') {
                    query = query.is('gestionado_por', null);
                } else if (this.vistaAsignacionActiva === 'mis_turnos') {
                    query = query.eq('gestionado_por', this.usuarioActual.cedula);
                } else if (this.vistaAsignacionActiva === 'en_atencion') {
                    query = query.not('gestionado_por', 'is', null);
                }
            }

            // APLICACIÓN DEL BUSCADOR (PUNTO 3)
            if (searchVal) {
                query = query.or(`nombre.ilike.%${searchVal}%,apellido.ilike.%${searchVal}%,cedula.ilike.%${searchVal}%,celular.ilike.%${searchVal}%,codigo_requerimiento.ilike.%${searchVal}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

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

                // NUEVO: INDICADOR VISUAL WHATSAPP ENVIADO
                let badgeWhatsApp = '';
                if (turno.whatsapp_enviado) {
                    badgeWhatsApp = `<span class="text-emerald-500 font-bold text-[11px]"><i class="fab fa-whatsapp"></i> Notificado</span>`;
                } else {
                    badgeWhatsApp = `<span class="text-slate-400 font-medium text-[11px]"><i class="fab fa-whatsapp opacity-30"></i> Sin enviar</span>`;
                }

                // MAPEO COMPLETO A COLUMNAS DEL SIC
                const nombreCompleto = `${turno.nombre || ''} ${turno.apellido || ''}`.trim() || 'Desconocido';

                tarjeta.innerHTML = `
                    ${badgeGestor}
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-slate-800 text-sm uppercase pr-16">${nombreCompleto}</h4>
                    </div>
                    <p class="text-xs text-slate-500 mt-1">C.C. ${turno.cedula || 'N/A'} - Req: <span class="font-bold font-mono">${turno.codigo_requerimiento || turno.id_asignacion || 'N/A'}</span></p>
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

    // MIGRADO: Manejo de reaperturas protegidas para confirmados SI (Punto 2)
    abrirChat(turno) {
        this.turnoActivoId = turno.id;
        this.turnoActivoTelefono = turno.celular; 

        document.getElementById('chat-vacio').classList.add('hidden');
        document.getElementById('chat-vacio').classList.remove('flex');
        document.getElementById('chat-activo').classList.remove('hidden');
        document.getElementById('chat-activo').classList.add('flex');

        const nombreCompleto = `${turno.nombre || ''} ${turno.apellido || ''}`.trim() || 'Desconocido';
        document.getElementById('chat-header-nombre').innerText = nombreCompleto;
        document.getElementById('chat-header-cedula').innerText = `C.C. ${turno.cedula || 'N/A'} | Tel: ${turno.celular || 'N/A'} | Req: ${turno.codigo_requerimiento || 'N/A'}`;
        document.getElementById('chat-info-cliente').innerText = turno.cliente || 'N/A';
        document.getElementById('chat-info-horario').innerText = `${turno.hora_servicio_desde || ''} - ${turno.hora_servicio_hasta || ''}`;

        const panelBotones = document.getElementById('panel-acciones-manuales');
        const areaEscritura = document.getElementById('area-escritura');
        const avisoMeta = document.getElementById('aviso-meta');
        const etiquetaAdmin = document.getElementById('etiqueta-admin-gestion');
        const panelReabrirSi = document.getElementById('panel-reabrir-si');
        const rpContainer = document.getElementById('container-respuestas-rapidas');

        if (this.vistaAsignacionActiva === 'en_atencion') {
            etiquetaAdmin.classList.remove('hidden');
        } else {
            etiquetaAdmin.classList.add('hidden');
        }

        // CONTROL LÓGICO DE ACCIONES Y VENTANA PROTEGIDA SI (PUNTO 2)
        panelReabrirSi.classList.add('hidden');
        if (rpContainer) rpContainer.classList.add('hidden');

        if (turno.estado_operativo === 'pendiente_respuesta') {
            panelBotones.classList.remove('hidden'); panelBotones.classList.add('flex');
            areaEscritura.classList.add('hidden'); areaEscritura.classList.remove('flex');
            avisoMeta.classList.remove('hidden');
        } else if (turno.estado_operativo === 'cerrado') {
            panelBotones.classList.add('hidden'); panelBotones.classList.remove('flex');
            areaEscritura.classList.add('hidden'); areaEscritura.classList.remove('flex');
            avisoMeta.classList.add('hidden');
        } else if (turno.estado_operativo === 'si') {
            // Se auto-cierra/bloquea, requiere el botón de validación de 20h
            panelBotones.classList.add('hidden'); panelBotones.classList.remove('flex');
            areaEscritura.classList.add('hidden'); areaEscritura.classList.remove('flex');
            avisoMeta.classList.add('hidden');
            panelReabrirSi.classList.remove('hidden');
            panelReabrirSi.classList.add('flex');
        } else {
            panelBotones.classList.add('hidden'); panelBotones.classList.remove('flex');
            areaEscritura.classList.remove('hidden'); areaEscritura.classList.add('flex');
            avisoMeta.classList.add('hidden');
            if (rpContainer) rpContainer.classList.remove('hidden');
        }

        this.cargarMensajes(turno.id);

        if(window.innerWidth < 768) {
            document.getElementById('section-lista').classList.add('hidden');
            document.getElementById('section-chat').classList.remove('hidden');
            document.getElementById('section-chat').classList.add('flex');
        }
    },

    // FUNCIÓN DE CONTROL: Validación de ventana segura de 20h (Punto 2)
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
            div.className = 'flex justify-center relative z-10 my-2';
            div.innerHTML = `
                <div class="bg-blue-50 text-blue-800 text-[10px] md:text-xs px-4 py-1.5 rounded-full border border-blue-200 text-center font-medium shadow-sm">
                    <i class="fas fa-info-circle mr-1"></i> ${texto}
                </div>`;
        }

        contenedor.appendChild(div);
        const zonaChat = document.querySelector('#section-chat .overflow-y-auto');
        if (zonaChat) zonaChat.scrollTop = zonaChat.scrollHeight;
    },

    // ---------------------------------------------------------
    // MÓDULO DE GESTIÓN Y SEGURIDAD DE USUARIOS
    // ---------------------------------------------------------
    
    async cargarUsuarios() {
        const contenedor = document.getElementById('lista-usuarios-container');
        if(!contenedor) return;
        
        contenedor.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-slate-400"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>Cargando usuarios...</td></tr>';

        try {
            const { data, error } = await supabaseClient
                .from('usuarios_plataforma')
                .select('*')
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
            const respuesta = await fetch('https://n8n.casalimpia.com/webhook/crear-usuario-saberbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer MiClaveSecreta2026' },
                body: JSON.stringify({ nombre: nuevoNombre, cedula: nuevaCedula, password: nuevaPassword, rol: nuevoRol })
            });
            if (!respuesta.ok) throw new Error("Error en servidor.");
            this.cerrarModalUsuario(); this.cargarUsuarios(); this.cargarDiccionarioUsuarios();
            alert("✅ Usuario creado correctamente.");
        } catch (err) {
            alert("❌ No se pudo crear el usuario.");
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
            const respuesta = await fetch('https://n8n.casalimpia.com/webhook/gestor-usuarios-saberbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer MiClaveSecreta2026' },
                body: JSON.stringify({ accion: 'resetear', cedula: cedula, password: nuevaPassword })
            });
            if (!respuesta.ok) throw new Error("Rechazado");
            alert(`✅ Contraseña de ${nombre} actualizada.`);
        } catch(err) {
            alert("❌ Error.");
        } finally {
            if(btn) btn.innerHTML = '<i class="fas fa-key"></i>';
        }
    },

    async eliminarUsuario(cedula, nombre) {
        if(!confirm(`⚠️ ¿Eliminar a ${nombre}?`)) return;
        try {
            const respuesta = await fetch('https://n8n.casalimpia.com/webhook/gestor-usuarios-saberbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer MiClaveSecreta2026' },
                body: JSON.stringify({ accion: 'eliminar', cedula: cedula })
            });
            if (!respuesta.ok) throw new Error("Rechazado");
            this.cargarUsuarios(); this.cargarDiccionarioUsuarios();
            alert(`✅ Usuario ${nombre} eliminado.`);
        } catch (err) {
            alert("❌ Error.");
        }
    },

    // ---------------------------------------------------------
    // NUEVOS PROCESOS: BANCO DE MENSAJES PERSONALIZADOS (PUNTO 4)
    // ---------------------------------------------------------
    async cargarRespuestasRapidas() {
        try {
            const { data, error } = await supabaseClient
                .from('respuestas_rapidas')
                .select('*')
                .order('created_at', { ascending: true });
                
            if (error) return console.warn("Respuestas rápidas no configuradas.");
            
            // Rellenar select de conversación
            const select = document.getElementById('select-respuestas-rapidas');
            if (select) {
                select.innerHTML = '<option value="">-- Selecciona una respuesta rápida --</option>';
                data.forEach(resp => {
                    const opt = document.createElement('option');
                    opt.value = resp.texto;
                    opt.innerText = resp.texto.length > 55 ? resp.texto.substring(0, 55) + '...' : resp.texto;
                    select.appendChild(opt);
                });
            }
            
            // Rellenar panel administrativo
            const contenedorAdmin = document.getElementById('lista-respuestas-rapidas-container');
            if (contenedorAdmin) {
                contenedorAdmin.innerHTML = '';
                if (data.length === 0) {
                    contenedorAdmin.innerHTML = '<div class="p-4 text-center text-xs text-slate-400">No hay mensajes configurados.</div>';
                    return;
                }
                data.forEach(resp => {
                    const div = document.createElement('div');
                    div.className = 'p-3 flex justify-between items-center text-xs text-slate-700 bg-white hover:bg-slate-50 transition-colors';
                    div.innerHTML = `
                        <div class="flex-1 font-medium pr-4 break-words">${resp.texto}</div>
                        <button onclick="App.eliminarRespuestaRapida('${resp.id}')" class="text-rose-500 p-1.5 hover:bg-rose-50 rounded transition-colors"><i class="fas fa-trash-alt"></i></button>
                    `;
                    contenedorAdmin.appendChild(div);
                });
            }
        } catch (err) {
            console.error("Error cargando mensajes rápidos:", err);
        }
    },

    async guardarRespuestaRapida() {
        const input = document.getElementById('nueva-respuesta-rapida');
        if (!input) return;
        const texto = input.value.trim();
        if (!texto) return alert("Escribe un texto válido.");
        
        try {
            const { error } = await supabaseClient.from('respuestas_rapidas').insert([{ texto: texto }]);
            if (error) throw error;
            input.value = '';
            this.cargarRespuestasRapidas();
            alert("✅ Respuesta guardada.");
        } catch (err) {
            alert("❌ Error al guardar.");
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
            // REEMPLAZO DINÁMICO DE LA VARIABLE {coordinador}
            textoInyectado = textoInyectado.replace(/{coordinador}/g, this.usuarioActual.nombre_completo);
        }
        
        inputChat.value = textoInyectado;
        select.value = ""; 
        inputChat.focus();
    },

    // ---------------------------------------------------------
    // MÓDULO DE ALERTAS VISUALES Y CONFIGURACIÓN
    // ---------------------------------------------------------
    async controlarAlertasVisuales() {
        if (!this.usuarioActual) return;
        try {
            const { count, error } = await supabaseClient
                .from('requerimientos_turnos_sic')
                .select('*', { count: 'exact', head: true })
                .eq('gestionado_por', this.usuarioActual.cedula)
                .neq('estado_operativo', 'cerrado');
                
            if (error) throw error;
            const banner = document.getElementById('banner-alerta-turnos');
            const badge = document.getElementById('badge-mis-turnos');
            const tabMisTurnos = document.getElementById('tab-mis-turnos');
            
            if (count > 0) {
                if (banner) banner.classList.remove('hidden');
                if (badge) { badge.innerText = count; badge.classList.remove('hidden'); }
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
            console.error(err);
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
                const minutosTotales = data.valor;
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
        }_finally {
            btn.innerHTML = 'Guardar';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => { App.init(); });
