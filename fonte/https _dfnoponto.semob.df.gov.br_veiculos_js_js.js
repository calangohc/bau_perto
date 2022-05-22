// Constantes
var USE_WEB_SERVER_FOR_TILES = true;
var DEFAULT_TILE_SERVERS = ['http://a.tile.openstreetmap.org', 'http://b.tile.openstreetmap.org', 'http://c.tile.openstreetmap.org'];
var WEB_SERVICE_PROTOCOL = 'https://';
var WEB_SERVICE_SERVER = 'www.sistemas.dftrans.df.gov.br';
var WEB_SERVICE_POSITIONS_URL_PIRACICABANA = '/ITS-infoexport/api/Data/VeiculosGTFS';
var WEB_SERVICE_POSITIONS_URL_MARECHAL = '/InLog/GetTempoReal';
var WEB_SERVICE_POSITIONS = '/service/gps/operacoes';
var WEB_SERVICE_PERCURSO = '/service/percurso/linha/numero/{{numLinha}}/WGS';
var M = {};//escopo de módulos

var AGENCY_PIRACICABANA = 'Piracicabana';
var AGENCY_MARECHAL = 'Marechal';
var AGENCY_PIONEIRA = 'Pioneira';
var AGENCY_SAO_JOSE = 'São José';
var AGENCY_URBI = 'Urbi';
var AGENCY_ARRAY = ['AGENCY_PIRACICABANA', 'AGENCY_MARECHAL', 'AGENCY_PIONEIRA', 'AGENCY_SAO_JOSE', 'AGENCY_URBI'];
var CURRENT_LINES = undefined;
var AUTO_UPDATE_TIMEOUT = undefined;

// Init
$(document).ready(function() {
	setTimeout(function() {

		map.setCarFetchListener(function(cars) {
			updateQuantitativos(cars);
			onCarsFetch(cars);
		});

		map.setLineClickListener(function(line) {
			if (line && map.filteredLinha == undefined) {
				$('#selectFiltro').val(line);
				$('#selectFiltro').trigger('change');
			}
		});

		map.setLoadStartListener(function() {
			document.getElementById('btnUpdate').disabled = true;
		});

		map.setLoadEndListener(function() {
			if (!$('#checkBoxUpdate').prop('checked')) {
				document.getElementById('btnUpdate').disabled = false;
			}

			$('#'+map.mapDivId).addClass('loaded');
		});

		map.loadCars();
	}, 1000);
});


// Var
var map = {
	map: undefined,
	mapDivId: 'map',
	cars: undefined,
	carsCopy: undefined,
	cluster: undefined,
	percursoLayer: undefined,
	filteredLinha: undefined,
	filteredAgency: undefined,
	filteredRunning: undefined,
	mapLastSignalUpdate: new Map(),
	lastSignalInterval: undefined,
	currentPopup: undefined,
	carIdReopenPopup: undefined,
	carFetchListener: undefined,
	mapPercursos: new Map(),
	lineClickListener: undefined,
	loadStartListener: undefined,
	loadEndListener: undefined,
	isLoading: false,
	// Inicializa o mapa
	_init: function() {
		var self = this;

		if (this.map == undefined) {
			this._createMap(this.mapDivId);
		}
	},
	// Carrega os veículos
	loadCars: function(onDone) {
		var self = this;

		if (this.loadStartListener) {
			this.loadStartListener();
			this.isLoading = true;
		}

		consultarPosicoesVeiculos(function(data) {
			self._onPositionsFetch(data);
		}, function() {
			self.isLoading = false;

			if (onDone) {
				onDone();
			}

			if (self.loadEndListener) {
				self.loadEndListener();
			}
		});
	},
	// Filtrar os carros por linha
	filterByLinha: function(linhaCod) {
		if (linhaCod) {
			this.filteredLinha = linhaCod;
			this.cars.forEach(function(c) { c.feature = undefined; });
			this.cluster.removeLayers(this.cluster.getLayers());

			this._updateMap();
		}
	},
	// Filtra os carros por operadora
	filterByAgency: function(agency) {
		if (agency) {
			this.filteredAgency = agency;
			this.cars.forEach(function(c) { c.feature = undefined; });
			this.cluster.removeLayers(this.cluster.getLayers());

			this._updateMap();
		}
	},
	// Filtra os carros que estão operando alguma linha
	filterRunningOnes: function() {
		if (this.filteredRunning == undefined || this.filteredRunning == false) {
			this.filteredRunning = true;
			this.cars.forEach(function(c) { c.feature = undefined; });
			this.cluster.removeLayers(this.cluster.getLayers());

			this._updateMap();
		}
	},
	// Apresenta todos os veículos
	showAll: function(afterLoading) {
		this.filteredLinha = undefined;
		this.filteredAgency = undefined;
		this.filteredRunning = undefined;
		this._setPercursoFeatureLayer(null);

		this.realoadFeatures();
	},
	// Atualiza os features correspondentes aos veículos no mapa
	realoadFeatures: function() {
		this.cluster.removeLayers(this.cluster.getLayers());
		this.cars = this.carsCopy.slice();
		this.cars.forEach(function(c) { c.feature = undefined; });

		this.cluster.enableClustering();

		this._updateMap();
	},
	// Remove a linha atualmente filtrada.
	removeFilteredLinha: function() {
		this.filteredLinha = undefined;
		this._setPercursoFeatureLayer(null);
		this.realoadFeatures();
	},
	// Configura um listener para o evento de carregamento de carros.
	setCarFetchListener: function(listener) {
		this.carFetchListener = listener;
	},
	// Configura um listener para o evento de click na label linha de um popup
	setLineClickListener: function(listener) {
		this.lineClickListener = listener;
	},
	// Configura um listener para o evento de início de carregamento de veículos
	setLoadStartListener: function(listener) {
		this.loadStartListener = listener;
	},
	// Configura um listener para o evento de fim do carregamento de veículos
	setLoadEndListener: function(listener) {
		this.loadEndListener = listener;
	},
	// Responde ao evento de obtenção de posições
	_onPositionsFetch: function(data) {
		this._init();

		if (this.cars == undefined) {
			this.cars = M.model.util.parseCarsWithPositions(data);
		} else {
			var newCars = M.model.util.parseNewCars(this.cars, data);

			this.cars = this.cars.concat(newCars);

			var positions = M.model.util.parsePositions(data);

			var currentSet = new Set(positions.map(function(p) { return p.carId; }));

			this.cars = this.cars.filter(function(car) { return currentSet.has(car.id); });

			M.model.util.joinCarsAndPositions(this.cars, positions);
		}

		this.carsCopy = this.cars.slice();

		if (this.carFetchListener) {
			this.carFetchListener(this.cars);
		}

		this._updateMap();
	},
	// Atualiza o mapa
	_updateMap: function() {
		var self = this;

		this.cars = this._filter();

		var carsSet = new Set(this.cars.map(function(c) { return c.id; }));

		var toRemove = this.cluster.getLayers().filter(function(layer) { return !carsSet.has(layer.attributes.car.id); });

		var toUpdate = this.cars.filter(function(c) {
			if (c.feature) {
				var carLast = c.lastPosition().date;
				var featureLast = c.feature.attributes.lastPosition.date;

				return carLast > featureLast;
			}

			return false;
		});

		// Registro do carro referente ao popup aberto
		var carIdReopenPopup = undefined;
		if (this.currentPopup) {
			carIdReopenPopup = this.currentPopup.options.car.id;
		}

		if (toUpdate.length) {
			toUpdate.forEach(function(car) {
				toRemove.push(car.feature);
				car.feature = undefined;
			});
		}

		if (toRemove.length) {
			this.cluster.removeLayers(toRemove);
		}

		var toAdd = this.cars.filter(function(c) {
			if (c.feature == undefined) {
				var lastPosition = c.lastPosition();

				c.feature = self._createCarFeature(c, lastPosition);
				c.feature.attributes = {};
				c.feature.attributes.car = c;
				c.feature.attributes.lastPosition = lastPosition;

				return true;
			}

			return false;
		}).map(function(c) { return c.feature; });

		if (toAdd.length) {
			this.cluster.addLayers(toAdd);
		}

		// Reabertura de popup
		if (carIdReopenPopup) {
			var layer = this.cluster.getLayers().filter(function(l) { return l.attributes.car.id == carIdReopenPopup; })[0];

			if (layer) {
				if (this.map.getZoom() < 15) {
					this.map.setView(layer.getLatLng(), 15);
				} else {
					this.map.setView(layer.getLatLng());
				}

				layer.openPopup();
			}
		}

		if (this.filteredLinha) {
			this._fetchPercursoLine(this.filteredLinha);
			this.cluster.disableClustering();
		}
	},
	// Realiza o filtro dos carros.
	_filter: function() {
		var self = this;

		if (this.filteredAgency || this.filteredLinha || this.filteredRunning) {
			this.cars = this.carsCopy.slice();
		}

		if (this.filteredAgency) {
			var agencies = this.filteredAgency.split(';').map(function(a) { return window[a]; });

			this.cars = this.cars.filter(function(c) { return c.agency && agencies.indexOf(c.agency) >= 0; });
		}

		if (this.filteredLinha) {
			this.cars = this.cars.filter(function(c) {
				if (c.line) {
					if (Array.isArray(self.filteredLinha)) {
						return self.filteredLinha.filter(function(l) { return c.line == l; })[0] != undefined;
					}

					return c.line == self.filteredLinha;
				}

				return false;
			});
		}

		if (this.filteredRunning) {
			this.cars = this.cars.filter(function(c) { return c.isRunning(); });
		}

		return this.cars;
	},
	// Cria o feature correspondente a um car
	_createCarFeature: function(car, carPosition) {
		var marker = this._buildVeiculoMarker(car, L.latLng(carPosition.lat, carPosition.long));

		var self = this;

		marker.bindPopup(this._buildPopupContent(car), { className: 'map_popup_veiculo popup_black_theme', car: car })
			.on('popupopen', function(event) {
		     	var popUp = event['popup'];

				popUp.setContent(self._buildPopupContent(popUp.options.car));

				self._onPopupOpen(popUp, popUp.options.car);
		    }).on('popupclose', function(event) {
		     	var popUp = event['popup'];

		     	self._onPopupClose(popUp, popUp.options.car);
		    });

		return marker;
	},
	// Cria um popup para um feature
	_buildPopupContent: function(car) {
		var lastP = car.lastPosition();

		return TEMPLATE_VEICULO.replace('[numLinha]', car.line && car.line != '09997' ? 'Linha ' + car.line : '')
											.replace('[numVeiculo]', car.id)
											.replace('[operadora]', car.agency)
											.replace('[data]', formatDate(lastP.date))
											.replace('[horario]', formatTime(lastP.date))
											.replace('[tempo]', formatPastTime(new Date(), lastP.date));
	},
	//Constroi o ícone referente a um agrupamento de veículos.
	_buildClusterIcon: function(cluster) {
		var childCount = cluster.getChildCount();
		var c = ' marker-cluster-';

		if (childCount < 10) {
			c += 'small';
		} else if (childCount < 100) {
			c += 'medium';
		} else {
			c += 'large';
		}

		return new L.DivIcon({ html: '<div><span>' + childCount + '</span></div>',  className: 'marker-cluster-bus marker-cluster' + c, iconSize: [40, 40] });
	},
  	// Constroi o maker para um feature veículo.
	_buildVeiculoMarker: function(car, latlng) {
	    var operadora = car.agency;
	    var icon;

	    if (operadora == AGENCY_PIRACICABANA) {
	    	icon = 'piracicabana.png';
	    } else if (operadora == AGENCY_MARECHAL) {
	    	icon = 'marechal.png';
	    } else if (operadora == AGENCY_SAO_JOSE) {
	    	icon = 'sao_jose.png';
	    } else if (operadora == AGENCY_PIONEIRA) {
	    	icon = 'pioneira.png';
	    } else if (operadora == AGENCY_URBI) {
	    	icon = 'urbi.png';
	    } else {
	    	icon = 'bus.png';
	    }

	    var iconVeiculo = new L.Icon({	
			iconSize: [20, 20],
		    iconAnchor: [10, 20],
		    popupAnchor: [1, -24],
		    iconUrl: 'img/' + icon 
		});

	    var marker = L.marker(latlng, { icon: iconVeiculo });

	    marker['options']['alt'] = 'Veículo ' + car.id + ', operadora ' + car.agency + (car.line ? ', linha ' + car.line : '');

	    return marker;
	},
  	// Cria um mapa
  	_createMap: function(divMap) {
  		var self = this;

	    var mapLayer = L.tileLayer('https://www.sistemas.dftrans.df.gov.br/tiles/{s}/{z}/{x}/{y}.png');
	    var satelliteLayer = L.tileLayer('http://ortofoto.mapa.codeplan.df.gov.br/tms/1.0.0/mosaico_df_2015@GMComp/{z}/{x}/{y}.png', { tms: true });

  		this.map = L.map(divMap, {
	    	center: [-15.794797016134899, -47.9262052592602],
	    	zoom: 11,
	    	maxZoom: 18,
	     	zoomControl: false,
      		layers: [mapLayer]
	    });

		this.cluster = new L.markerClusterGroup({ disableClusteringAtZoom: 15, iconCreateFunction: function(cluster) { return self._buildClusterIcon(cluster); } });
		this.cluster.addTo(this.map);

		L.control.layers({
			'Mapa': mapLayer,
			'Satélite': satelliteLayer
		}, {
			'Veículos': this.cluster
		}).addTo(this.map);

		L.control.locate({
			position: 'topright',
			strings: {
				popup: 'Sua localização',
				title: 'Minha localização'
			},
			markerClass: L.Marker.extend({
				initialize: function (latlng, options) {
		            this._latlng = latlng;

		            this.setIcon(new L.Icon({
                        iconUrl: 'img/user_locate_stroke_mini.png',
                        shadowUrl: 'img/marker-shadow.png',
                        iconAnchor: [20.5, 41],
                        popupAnchor: [1, -38],
                        shadowAnchor: [10, 40]
	                }));
		        }
			}),
			markerStyle: { alt: 'Minha localização' },
		    icon: 'map_location_icon',
		    iconLoading: 'map_location_loading_icon loading_animation',
			drawCircle: false,
			keepCurrentZoomLevel: true,
			onLocationError: function(err) { M.messages.showError('Não foi possível obter sua localização'); }
		}).addTo(this.map);

		this.percursoLayer = L.geoJSON(undefined, {
			style: function(feature) {
				if (feature.properties['percorrido']) {
					return {
					    'color': '#3388ff',
					    //'color': '#607d8bd6',
					    'weight': 3,
					    'opacity': 0.55
					};
				} else {
					return undefined;
				}
		    }
		});
		this.percursoLayer.addTo(this.map);
  	},
  	// Adiciona um popup a ser atualizado
  	_addLastSignalToUpdate: function(carId, popUp) {
  		if (popUp.isOpen()) {
  			this.mapLastSignalUpdate.set(carId, popUp);
  		}

  		if (this.mapLastSignalUpdate.size > 0 && this.lastSignalInterval == undefined) {
  			this._startLastSignalUpdate();
  		}
  	},
  	// Inicia o intervalo de atualização dos popups
  	_startLastSignalUpdate: function() {
  		var self = this;

  		this.lastSignalInterval = setInterval(function() {
			self._updateLastSginal();

  			if (self.mapLastSignalUpdate.size == 0) {
  				self._stopLastSignalUpdate();
  			}
  		}, 1000);
  	},
  	// Interrompe o intervalo de atualização dos popups
  	_stopLastSignalUpdate: function() {
		clearInterval(this.lastSignalInterval);
		this.lastSignalInterval = undefined;
  	},
  	// Atualiza os popups abertos
  	_updateLastSginal: function() {
  		for (var [carId, popUp] of this.mapLastSignalUpdate) {
			if (popUp.isOpen()) {

				var carDate = popUp.options.car.lastPosition().date;
				var currentDate = new Date();

				$(popUp['_contentNode']).find('.last_signal_table_value').text(formatPastTime(currentDate, carDate));
			} else {
				this.mapLastSignalUpdate.delete(carId);
			}
		}
  	},
  	// Responde ao evento de abertura de um popup.
  	_onPopupOpen: function(popUp, car) {
  		var self = this;

		this._addLastSignalToUpdate(car, popUp);

		this.currentPopup = popUp;

		$(popUp['_container']).find('.veiculo_info_linha_titulo').on('click', function(e) {
			var line = $(e.target).text().replace('Linha ', '');

			if (self.lineClickListener) {
				self.lineClickListener(line);
			}
		});

		this._fetchPercurso(car);
  	},
  	// Responde ao evento de fechamento de um popup.
  	_onPopupClose: function(popUp, car) {
		if (this.currentPopup == popUp) {
		    this.currentPopup = undefined;
		}

		if (this.filteredLinha) {
			this._setPercursoFromMapaLine(this.filteredLinha);
		} else {
			this._setPercursoFeatureLayer(null);
		}
  	},
  	// Obtem e configura o percurso correspondente a uma linha e sentido.
  	_fetchPercurso: function(car) {
  		var self = this;
  		var numLinha = car.line;
  		var sentido = car.sentido;

  		if (numLinha) {
	  		if (this.mapPercursos.has(numLinha)) {
	  			this._setPercursoFromMapa(car);
	  		} else {
	  			consultarPercurso(numLinha, function(collection) {
		  			var features = collection.features;

		  			if (features.length > 0) {
						self.mapPercursos.set(numLinha, features);

						self._setPercursoFromMapa(car);
		  			}
		  		});
	  		}
  		}
  	},
  	// Obtem e configura o percurso correspondente a uma linha.
  	_fetchPercursoLine: function(line, centerPercurso) {
  		var self = this;

  		if (line) {
	  		if (this.mapPercursos.has(line)) {
	  			this._setPercursoFromMapaLine(line, centerPercurso);
	  		} else {
	  			consultarPercurso(line, function(collection) {
		  			var features = collection.features;

		  			if (features.length > 0) {
						self.mapPercursos.set(line, features);

						self._setPercursoFromMapaLine(line, centerPercurso);
		  			}
		  		});
	  		}
  		}
  	},
  	// Configura o percurso respectivo a uma linha e sentido.
  	_setPercursoFromMapa: function(car) {
  		var numLinha = car.line;
  		var sentido = car.sentido;

  		var percursos = this.mapPercursos.get(numLinha);

  		if (percursos && percursos.length) {
  			var percurso = sentido ? percursos.filter(function(percurso) { return percurso.properties.sentido == sentido; })[0] : undefined;

  			this._setPercursoFeatureLayer(percurso ? [percurso] : percursos, car);
  		}
  	},
  	// Configura o percurso respectivo a uma linha.
  	_setPercursoFromMapaLine: function(line, centerPercurso) {
  		var percursos = this.mapPercursos.get(line);

  		if (percursos && percursos.length) {
  			this._setPercursoFeatureLayer(percursos);

  			if (centerPercurso) {
  				this.map.fitBounds(this.percursoLayer.getBounds());
  			}
  		}
  	},
  	// Configura o percurso corrente na layer de percursos.
  	_setPercursoFeatureLayer(geoJsonPercursos, car) {
  		var self = this;

  		this.percursoLayer.clearLayers();

		if (geoJsonPercursos && geoJsonPercursos.length) {
			if (geoJsonPercursos.length == 1 && car) {
  				var position = car.lastPosition();
  				var percurso = geoJsonPercursos[0];

				geoJsonPercursos = this._splitLineString(percurso, L.latLng(position.lat, position.long));
			}

			geoJsonPercursos.forEach(function(geoJson) {
				self.percursoLayer.addData(geoJson);
			});
  		}
  	},
  	// Divide um lineString em dois percursos dado uma coordenada de interseção
  	_splitLineString: function(lineStrGeojson, latLng) {
  		var distanceArray = lineStrGeojson.geometry.coordinates.map(function(longLat, index) { return [index, getDistance([longLat[1], longLat[0]], [latLng.lat, latLng.lng])]; });

  		var minDistance = undefined;

  		for (var i = 0; i < distanceArray.length; i++) {
  			if (minDistance == undefined) {
				minDistance = distanceArray[i];
  			} else if (distanceArray[i][1] < minDistance[1]) {
  				minDistance = distanceArray[i];
  			}
  		}

  		if (minDistance != undefined && minDistance[1] < 500) {
		  	function cloneLineString(geoJsonFrom, isPercorrido, coordinates) {
		  		function cloneProps(props, isPercorrido) {
			  		var obj = {};
			  		Object.keys(props).forEach(function(key) { obj[key] = props[key]; });
			  		obj['percorrido'] = isPercorrido;
			  		return obj;
			  	}

		  		return {
	  				type: 'Feature',
	  				properties: cloneProps(geoJsonFrom.properties, isPercorrido),
	  				geometry: {
	  					type: 'LineString',
	  					coordinates: coordinates
	  				}
	  			}
		  	}

  			return [cloneLineString(lineStrGeojson, true, lineStrGeojson.geometry.coordinates.slice(0, minDistance[0] + 1)), 
  					cloneLineString(lineStrGeojson, false, lineStrGeojson.geometry.coordinates.slice(minDistance[0]))];
  		}

  		return [lineStrGeojson];
  	}
};

// Classes para parse de geojson
M.geojson = (function() {
	function Geometry(coordinates, type) {
		this.coordinates = coordinates;
        this.type = type;
	}
	Geometry.fromJSON = function(jsonObj) {
        return new Geometry(jsonObj['coordinates'], jsonObj['type']);
    };


	function Feature(geometry, properties, type) {
		this.geometry = geometry;
        this.properties = properties;
        this.type = type;
	}
	Feature.fromJSON = function(jsonObj) {
        return new Feature(Geometry.fromJSON(jsonObj['geometry']), jsonObj['properties'], jsonObj['type']);
    };


    function FeatureCollection(features, type) {
    	this.features = features;
    	this.type = type;
    }
    FeatureCollection.fromJSON = function(jsonObj) {
        return new FeatureCollection(jsonObj['features'].map(f => Feature.fromJSON(f)), jsonObj['type']);
    };

    return  {
		Geometry: Geometry,
		Feature: Feature,
		FeatureCollection: FeatureCollection
	}
})();

// Classes
M.class = (function() {

	function PositionClass(date, lat, long, carId) {
		this.date = date;
		this.lat = lat;
		this.long = long;
		this.carId = carId;
	}


	function CarClass(carId, line, agency, sentido) {
		this.id = carId;
		this.line = line;
		this.sentido = sentido;
		this.positions = [];
		this.agency = agency;
	}
	CarClass.prototype.lastPosition = function() {
		if (this.positions.length > 0) {
			return this.positions[this.positions.length-1];
		}
		return undefined;
	};
	CarClass.prototype.addPosition = function(position) {
		this.positions.push(position);
	};
	CarClass.prototype.isRunning = function() {
		return this.line && this.line != '09997';
	};


	return  {
		Position: PositionClass,
		Car: CarClass
	}
})();


// Utilitários
M.model = {
	util: {
		// Realiza o parse de uma position
		parseDataToPosition: function(v) {
			return new M.class.Position(new Date(v.horario), v.localizacao.latitude, v.localizacao.longitude, v.numero);
		},
		// Realiza o parse de um car
		parseDataToCar: function(v) {
			return new M.class.Car(v.numero, v.linha, undefined, v.sentido);
		},
		// Realiza o parse de uma data
		parseDate: function(dateStr) {
			if (dateStr != undefined) {
				var split = dateStr.split(' ');

				if (split.length == 2) {
					var dateCharSep = '/';
					if (dateStr.indexOf('/') == -1) {
						dateCharSep = '-';
					}

					var splitDate = split[0].split(dateCharSep);

					if (splitDate.length == 3) {
						var day = splitDate[0];
						var month = splitDate[1];
						var year = splitDate[2];

						var splitTime = split[1].split(':');

						if (splitTime.length == 3) {
							var hour = splitTime[0];
							var minute = splitTime[1];
							var second = splitTime[2];

							return new Date(year, month-1, day, hour, minute, second, 0);
						}
					}
				}
			}
		},
		// Realiza o parse de um conjunto de positions
		parsePositions: function(data) {
			var self = this;
			function parse(data)  {
				return data.veiculos.map(self.parseDataToPosition);
			}

			return Array.isArray(data) ? flatMap(parse, data) : parse(data);
		},
		// Realizao parse de um conjunto de cars
		parseCars: function(data) {
			var self = this;
			function parse(data) {
				var parseFuntion = function(obj) {
					var car = self.parseDataToCar(obj);
					
					if (data.operadora.nome.indexOf('PIRACICABANA') != -1) {
						car.agency = AGENCY_PIRACICABANA;
					} else if (data.operadora.nome.indexOf('MARECHAL') != -1) {
						car.agency = AGENCY_MARECHAL;
					} else if (data.operadora.nome.indexOf('PIONEIRA') != -1) {
						car.agency = AGENCY_PIONEIRA;
					} else if (data.operadora.nome.indexOf('SÃO JOSÉ') != -1) {
						car.agency = AGENCY_SAO_JOSE;
					} else if (data.operadora.nome.indexOf('URBI') != -1) {
						car.agency = AGENCY_URBI;
					}
					
					return car;
				};

				return data.veiculos.map(parseFuntion);
			}

			var cars = Array.isArray(data) ? flatMap(parse, data) : parse(data);

			var map = new Map();
			cars.forEach(function(c) { map.set(c.id, c); });

			return Array.from(map.values());
		},
		// Realiza o parse um conjunto de cars preenchendo suas positions
		parseCarsWithPositions: function(data) {
			return this.joinCarsAndPositions(this.parseCars(data), this.parsePositions(data));
		},
		// Atualiza um array de cars com positions
		joinCarsAndPositions: function(cars, positions) {
			var carsMap = new Map();

			cars.forEach(function(c) {
				carsMap.set(c.id, c);
			});

			positions.forEach(function(p) {
				var car = carsMap.get(p.carId);

				car.addPosition(p);
			});

			return cars;
		},
		// Realiza o parse dos carros não presente em uma lista.
		parseNewCars: function(currentCars, data) {
			var currentSet = new Set(currentCars.map(function(c) { return c.id; }));

			var cars = this.parseCars(data);

			return cars.filter(function(car) { return !currentSet.has(car.id) });
		}
	}
};

// Controla exibição de mensagens
M.messages = {
	// ID do elemento notification bar
	barId: 'notification-bar',
	// Time out da animação slideUp
	slideUpTimeout: undefined,
	// Mostra uma mensagem com estilizada por uma classe css
	showMsgClass: function(msg, className) {
		var div = document.createElement('div');
		div.className = className;
		div.innerHTML = msg;
		this.showMsg(div);

		if (this.speak) {
			if (msg.startsWith('<')) {
				msg = msg.substring(3);
			}
			this.speak(msg);
		}
	},
	// Mostra uma mensagem de error
	showError: function(msg) {
		this.showMsgClass(msg, 'notification_error');
	},
	// Mostra uma mensagem de atenção
	showWarn: function(msg) {
		this.showMsgClass(msg, 'notification_warn');
	},
	// Mostra uma mensagem informativa
	showInfo: function(msg) {
		this.showMsgClass(msg, 'notification_info');
	},
	// Mostra uma mensagem no início da página
	showMsg: function(message, duration) {
		var self = this;

		duration = typeof duration !== 'undefined' ? duration : 3000;

		var $bar = $('#'+this.barId);
		$bar.empty();
		$bar.append(message);

		// Obs.: configura o min-height para 0 só enquanto a animação ocorre; workaround necessário
		var minHeight = $bar.css('min-height');
		$bar.css('min-height', 0);

		$bar.slideDown(function() {
			$bar.css('min-height', minHeight);

			self.slideUpTimeout = setTimeout(self.slideUpBar, duration);
		});
	},
	// Realiza o slideUp
	slideUpBar: function() {
		var $bar = $('#'+M.messages.barId);

		var minHeight = $bar.css('min-height');

		$bar.css('min-height', 0);

		$bar.slideUp(function() {
			$bar.css('min-height', minHeight);
		});
	},
	// Esconde a barra de notificação
	hide: function() {
		clearTimeout(this.slideUpTimeout);
		M.messages.slideUpBar();
	}
};

// Controla animações de carregamento da página.
M.loading = {
	showTop: function() {
		this.show('top_loading');
	},
	hideTop: function() {
		this.hide('top_loading');
	},
	show: function(elemId) {
		$('#'+elemId).fadeIn();
	},
	hide: function(elemId) {
		$('#'+elemId).fadeOut();
	}
};


// Registra um conjunto de linhas.
function saveGroup(lines) {
	localStorage.setItem('lines', JSON.stringify(lines));
}

// Carrega o grupo de linhas salvo.
function loadGroup() {
	var lines = localStorage.getItem('lines');

	if (lines) {
		return JSON.parse(lines);
	}

	return null;
}

// Configura o group salvo.
function setSavedGroup() {
	var group = loadGroup();

	if (group) {
		$('#selectFiltro').val(group).trigger('change');
	}
}

// Responde ao evento de click em um agency card
function onClickAgencyCard(event, card, agency) {
	var $card = $('.' + card);

	if ($card.hasClass('agency_card_disabled')) {
		$card.removeClass('agency_card_disabled');

		AGENCY_ARRAY.push(agency);

		if (AGENCY_ARRAY.length == 5) {
			
			map.filteredAgency = undefined;
			map.realoadFeatures();

		} else {
			map.filterByAgency(AGENCY_ARRAY.join(';'));
		}
	} else {
		if (AGENCY_ARRAY.length > 1) {
			var i = AGENCY_ARRAY.indexOf(agency);

			if (i >= 0) {
				$card.addClass('agency_card_disabled');

				AGENCY_ARRAY.splice(i, 1);
				map.filterByAgency(AGENCY_ARRAY.join(';'));
			}
		}
	}
}

// Responde ao evento de click no botão update.
function onClickBtnUpdate() {
	map.loadCars();
}

// Responde ao evento de click na label correspondente ao checkbox update
function onClickLabelCheckboxUpdate() {
	$('#checkBoxUpdate').prop('checked', ! $('#checkBoxUpdate').prop('checked'));
	toggleAutoUpdate();
}

// Responde ao evento de click na label correspondente ao checkbox operação.
function onClickLabelCheckboxOperacao() {
	$('#checkBoxOperacao').prop('checked', ! $('#checkBoxOperacao').prop('checked'));
	toggleEmOperacao();
}

// Responde ao evento de carregamento de carros.
function onCarsFetch(cars) {

	if ($('#selectFiltro').hasClass("select2-hidden-accessible") && CURRENT_LINES != undefined) {

		var appended = false;

		cars.map(function(c) { return c.line; }).filter(function(line) { return line; }).filter(function(line) {
			if (!CURRENT_LINES.has(line)) {
				CURRENT_LINES.add(line);
				return true;
			}
			return false;
		}).map(function(line) {
			return new Option(line, line);
		}).forEach(function(opt) {
			$('#selectFiltro').append(opt);

			appended = true;
		});
		
		if (appended) {
			if (!CURRENT_LINES.has('Group')) {
				$('#selectFiltro').append(new Option('Group', 'Group'));	
			}
			
			$('#selectFiltro').trigger('change');
		}
	} else {
		CURRENT_LINES = new Set(cars.map(function(c) { return c.line; }).filter(function(line) { return line; }));

		var data = Array.from(CURRENT_LINES.values()).filter(function(line) { return line; }).map(function(line) {
			return {
				id: line,
				text: line
			};
		});

		data.push({id: 'Group', text: 'Group'});

		$('#selectFiltro').select2({
			data: data,
			allowClear: true,
			placeholder: 'ex.: 099.1'
		}).on('change.select2', function (e) {

			var value = $('#selectFiltro').val();

			if (Array.isArray(value)) {
				value = value.filter(function(l) {return l;});
			} else if (value) {
				value = [value];
			} else {
				value = [];
			}

			if (value.length) {
				if (value.filter(function(l) {return l == 'Group';})[0] != undefined) {
					var group = loadGroup();

					if (group && group.length) {
						value = group;
					}
				}

				map.filterByLinha(value);

				if (value.length > 1) {
					saveGroup(value);
				}
			} else if (map.filteredLinha) {
				map.removeFilteredLinha();
			}

		});

		var defaultOption = new Option();
		defaultOption.selected = true;
		$('#selectFiltro').append(defaultOption);
	}
}

// Atualiza os quantitativos respectivos a cada agency.
function updateQuantitativos(cars) {
	var countUrbi = 0;
	var countRunningUrbi = 0;
	var countPioneira = 0;
	var countRunningPioneira = 0;
	var countMarechal = 0;
	var countRunningMarechal = 0;
	var countPiracicabana = 0;
	var countRunningPiracicabana = 0;
	var countSaoJose = 0;
	var countRunningSaoJose = 0;
	var total = cars.length;
	var totalRunning = 0;

	for (var i = 0; i < cars.length; i++) {
		var car = cars[i];

		if (car.agency == AGENCY_MARECHAL) {
			countMarechal++;

			if (car.line != undefined && car.line.length > 0 && car.line != '09997') {
				countRunningMarechal++;
			}
		} else if (car.agency == AGENCY_PIRACICABANA) {
			countPiracicabana++;

			if (car.line != undefined && car.line.length > 0) {
				countRunningPiracicabana++;
			}
		} else if (car.agency == AGENCY_PIONEIRA) {
			countPioneira++;

			if (car.line != undefined && car.line.length > 0) {
				countRunningPioneira++;
			}
		} else if (car.agency == AGENCY_SAO_JOSE) {
			countSaoJose++;

			if (car.line != undefined && car.line.length > 0) {
				countRunningSaoJose++;
			}
		} else if (car.agency == AGENCY_URBI) {
			countUrbi++;

			if (car.line != undefined && car.line.length > 0) {
				countRunningUrbi++;
			}
		}
	}

	totalRunning = countRunningPiracicabana + countRunningMarechal + countRunningPioneira + countRunningSaoJose + countRunningUrbi;

	setPanelVisibility('.agency_card_container', true);
	setPanelVisibility('.filtro_linha_container', true);

	$('#info_total').text('Total: ' + totalRunning + ' / ' + total);
	$('#info_piracicabana').text((countPiracicabana > 531 ? 531 : countPiracicabana) + ' / ' + ' 531');
	$('#info_marechal').text((countMarechal > 464 ? 464 : countMarechal) + ' / ' + ' 464');
	$('#info_pioneira').text((countPioneira > 625 ? 625 : countPioneira) + ' / ' + ' 625');
	$('#info_sao_jose').text((countSaoJose > 575 ? 575 : countSaoJose) + ' / ' + ' 575');
	$('#info_urbi').text((countUrbi > 520 ? 520 : countUrbi) + ' / ' + ' 520');
}

// Alterna a visibilidade de um painel.
function togglePanel(selector) {
	$(selector).toggleClass('hidden');
}

// Controla a visibilidade de um painel.
function setPanelVisibility(selector, hasVisibility) {
	var $panel = $(selector);
	var hideClassName = 'hidden';

	hasVisibility ? $panel.removeClass(hideClassName) : $panel.addClass(hideClassName);
}

// Alterna entre a função de auto atualização dos veículos.
function toggleAutoUpdate() {
	if (AUTO_UPDATE_TIMEOUT == undefined) {
		AUTO_UPDATE_TIMEOUT = setInterval(function() {
			map.loadCars();
		}, 5000);

		document.getElementById('btnUpdate').disabled = true;
	} else {
		clearInterval(AUTO_UPDATE_TIMEOUT);
		AUTO_UPDATE_TIMEOUT = undefined;

		document.getElementById('btnUpdate').disabled = false;
	}
}

// Alterna entre a função de filtro de veículos que estão operando alguma linha.
function toggleEmOperacao() {
	if (map.filteredRunning) {
		map.filteredRunning = undefined;
		map.realoadFeatures();
	} else {
		map.filterRunningOnes();
	}
}


// Consulta percursos associado ao número de uma linha
function consultarPercurso(numLinha, onSucceedCallback, onFinallyCallback) {
	function onError(msg) {
		M.messages.showError('<#> ' + msg);
	}

	doGet(WEB_SERVICE_PROTOCOL + WEB_SERVICE_SERVER + WEB_SERVICE_PERCURSO.replace('{{numLinha}}', numLinha), onSucceedCallback, onFinallyCallback, onError);
}

// Consulta estado dos veículos
function consultarPosicoesVeiculos(onSucceedCallback, onFinallyCallback) {
	M.loading.showTop();

	function onError(msg) {
		M.messages.showError('<#> ' + msg);
	}

	function onFinally() {
		M.loading.hideTop();
		if (onFinallyCallback) {
			onFinallyCallback();
		}
	}
	
	doGet(WEB_SERVICE_PROTOCOL + WEB_SERVICE_SERVER + WEB_SERVICE_POSITIONS, onSucceedCallback, onFinally, onError);
}

// Realiza uma requisição GET
function doGet(url, onSucceed, onFinally, exceptionHandler) {
	$.get(url, function(data, status) {
		if (status == 'success') {
			onSucceed(data);
		} else {
			if (exceptionHandler) {
				exceptionHandler('consulta não sucedida: ' + status);
			}

			console.log('<!> consulta a ' + url + ' não sucedida: ' + status);
		}
	}).fail(function() {
		if (exceptionHandler) {
			exceptionHandler('erro de conexão ao realizar consulta');
		}

		console.log('<#> erro de conexão ao consultar ' + url);
	}).complete(function() {
		if (onFinally) {
			onFinally();
		}
	});
}

// Retorna a data de um date em string
function formatDate(date) {
	var day = date.getDate();

	if (day < 10) {
		day = '0' + day;
	} else {
		day = String(day);
	}

	var month = date.getMonth() + 1;

	if (month < 10) {
		month = '0' + month;
	} else {
		month = String(month);
	}

	var year = date.getFullYear();

	return day + '/' + month + '/' + year;
}

// Retorna o horário de um date em string
function formatTime(date) {
	var hours = date.getHours();

	if (hours < 10) {
		hours = '0' + hours;
	} else {
		hours = String(hours);
	}

	var minutes = date.getMinutes();

	if (minutes < 10) {
		minutes = '0' + minutes;
	} else {
		minutes = String(minutes);
	}

	var seconds = date.getSeconds();

	if (seconds < 10) {
		seconds = '0' + seconds;
	} else {
		seconds = String(seconds);
	}

	return hours + ':' + minutes + ':' + seconds;
}

// Retorna o tempo decorrido entre duas datas
function formatPastTime(date1, date2) {
	function sec(secs, mins) {
		if (mins != undefined) {
			secs = secs - (60 * mins);
		}

		return secs == 0 ? '' : secs + 'sec';
	}

	function min(mins, hours) {
		if (hours != undefined) {
			mins = mins - (60 * hours);
		}

		return mins == 0 ? '' : mins + 'min';
	}

	var difTime = Math.abs(date1.getTime() - date2.getTime());

	var seconds = parseInt(difTime / 1000);

	if (seconds < 60) {
		return sec(seconds);
	}

	if (seconds == 60) {
		return '1min';
	}

	var minutes = parseInt(seconds / 60);

	if (minutes < 60) {
		return min(minutes) +' '+ sec(seconds, minutes);
	}

	if (minutes == 60) {
		return '1h';
	}

	var hours = parseInt(minutes / 60);

	return hours + 'h' +' '+ min(minutes, hours) + ' '+ sec(seconds, minutes);
}

// Implementação de flat map
function flatMap(f, xs) {
	function concat(x, y) {
		return x.concat(y);
	}

	return xs.map(f).reduce(concat, []);
}

// Aplica filtro de entrada em um input.
function setInputFilter(textbox, inputFilter) {
	if (textbox) {
	  ["input", "keydown", "keyup", "mousedown", "mouseup", "select", "contextmenu", "drop"].forEach(function(event) {
	    textbox.addEventListener(event, function() {
	      if (inputFilter(this.value)) {
	        this.oldValue = this.value;
	        this.oldSelectionStart = this.selectionStart;
	        this.oldSelectionEnd = this.selectionEnd;
	      } else if (this.hasOwnProperty("oldValue")) {
	        this.value = this.oldValue;
	        this.setSelectionRange(this.oldSelectionStart, this.oldSelectionEnd);
	      }
	    });
	  });
	}
}

// Calcula a distância entre dois pontos
function getDistance(origin, destination) {
	function toRadian(degree) {
	    return degree*Math.PI/180;
	}

    // return distance in meters
    var lon1 = toRadian(origin[1]),
        lat1 = toRadian(origin[0]),
        lon2 = toRadian(destination[1]),
        lat2 = toRadian(destination[0]);

    var deltaLat = lat2 - lat1;
    var deltaLon = lon2 - lon1;

    var a = Math.pow(Math.sin(deltaLat/2), 2) + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(deltaLon/2), 2);
    var c = 2 * Math.asin(Math.sqrt(a));
    var EARTH_RADIUS = 6371;

    return c * EARTH_RADIUS * 1000;
}

var TEMPLATE_VEICULO = `
	<div id='mapaPercusoPopupContainer' class='mapa_percurso_popup_container'> 
	<div class='mapa_titulo'>
		<div><strong class="veiculo_info_linha_titulo">[numLinha]</strong></div>
	</div>
	<div class="linha_hr"></div>
	<table class='mapa_percurso_popup_table'> 
		<tbody>
		<tr>
			<td class='mapa_percurso_popup_table_label'>Operadora</td>
			<td class='mapa_percurso_popup_table_spacer'>:&nbsp;</td>
			<td class='mapa_percurso_popup_table_value'>[operadora]</td>
		</tr>
		<tr> 
			<td class='mapa_percurso_popup_table_label'>Número</td> 
			<td class='mapa_percurso_popup_table_spacer'>:&nbsp;</td> 
			<td class='mapa_percurso_popup_table_value'>[numVeiculo]</td> 
		</tr> 
		<tr>
			<td class='mapa_percurso_popup_table_label'>Data</td>
			<td class='mapa_percurso_popup_table_spacer'>:&nbsp;</td>
			<td class='mapa_percurso_popup_table_value'>[data]</td>
		</tr>
		<tr>
			<td class='mapa_percurso_popup_table_label'>Horário</td>
			<td class='mapa_percurso_popup_table_spacer'>:&nbsp;</td>
			<td class='mapa_percurso_popup_table_value'>[horario]</td>
		</tr>
		<tr>
			<td class='mapa_percurso_popup_table_label'>Último Sinal</td>
			<td class='mapa_percurso_popup_table_spacer'>:&nbsp;</td>
			<td class='mapa_percurso_popup_table_value last_signal_table_value'>[tempo]</td>
		</tr>
		 
		</tbody> 
	</table> 
</div>`;