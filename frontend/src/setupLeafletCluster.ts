import L from 'leaflet'

// Expor a instância ESM do Leaflet como window.L ANTES de leaflet.markercluster
// carregar. O plugin é UMD e aplica o patch (L.markerClusterGroup) em window.L;
// sem isto ele patcheia uma instância diferente e markerClusterGroup fica undefined.
const w = window as unknown as { L: typeof L }
w.L = L
