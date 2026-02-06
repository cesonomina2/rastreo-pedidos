/**
 * MOCK DATA - Base de datos simulada para rastreo de pedidos.
 * Estructura basada en el requerimiento del usuario.
 */

const MOCK_DB = {
    // CASO 1: Entregado Exitosamente
    "GUIA-001": {
        id: "GUIA-001",
        client: {
            nit: "900123456",
            name: "Juan Perez",
            city: "Bogotá D.C.",
            frente: "Centros Comerciales",
            address: "Calle 100 # 15-20"
        },
        logistics: {
            carrier: "Servientrega",
            estimated_date: "2023-11-20",
            out_for_delivery_at: "2023-11-20",
            pod_url: "#", // Link a prueba de entrega
        },
        history: {
            created_at: "2023-11-15",
            packed_at: "2023-11-16",
            dispatched_at: "2023-11-17",
            delivered_at: "2023-11-20"
        },
        status: {
            current: "delivered", // created, packed, dispatched, in_transit, delivered
            exception: null
        }
    },

    // CASO 2: En Tránsito (Despachado)
    "GUIA-002": {
        id: "GUIA-002",
        client: {
            nit: "800987654",
            name: "Maria Rodriguez",
            city: "Medellín",
            frente: "Residencial",
            address: "Carrera 43A # 1-50"
        },
        logistics: {
            carrier: "Envía",
            estimated_date: "2023-11-25",
            out_for_delivery_at: null,
            pod_url: null,
        },
        history: {
            created_at: "2023-11-21",
            packed_at: "2023-11-22",
            dispatched_at: "2023-11-22",
            delivered_at: null
        },
        status: {
            current: "dispatched",
            exception: "Retraso leve en carretera"
        }
    },

    // CASO 3: Recién creado
    "GUIA-003": {
        id: "GUIA-003",
        client: {
            nit: "123456789",
            name: "Carlos Gomez",
            city: "Cali",
            frente: "Corporativo",
            address: "Av 6N # 20-30"
        },
        logistics: {
            carrier: "Coordinadora",
            estimated_date: "2023-11-30",
            out_for_delivery_at: null,
            pod_url: null,
        },
        history: {
            created_at: "2023-11-24",
            packed_at: null,
            dispatched_at: null,
            delivered_at: null
        },
        status: {
            current: "created",
            exception: null
        }
    }
};

// Función simulada de API
function mockFetchTracking(trackingId) {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const data = MOCK_DB[trackingId];
            if (data) {
                resolve(data);
            } else {
                reject("Pedido no encontrado");
            }
        }, 800); // Delay artificial de 800ms para realismo
    });
}
