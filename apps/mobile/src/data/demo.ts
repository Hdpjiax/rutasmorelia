export const ROUTES = [
  {id: '4', number: 'C', name: 'Alberca Gertrudis', detail: 'Ruta de combi', time: 'Combi', color: '#6F7E24'},
  {id: '5', number: 'C', name: 'Alberca Metrópolis', detail: 'Ruta de combi', time: 'Combi', color: '#C9542D'},
  {id: '6', number: 'C1', name: 'Amarilla 1 centro', detail: 'Ruta de combi', time: 'Combi', color: '#E5B900'},
];

export const routeCollection: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export const stopCollection: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [[-101.1925, 19.7027], [-101.2014, 19.7002], [-101.1854, 19.7054], [-101.225, 19.692]].map((coordinates, index) => ({
    type: 'Feature', properties: {id: index + 1}, geometry: {type: 'Point', coordinates},
  })),
};
