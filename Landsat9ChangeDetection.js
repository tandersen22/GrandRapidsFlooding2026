Map.centerObject(aoi);

//Load Landsat 9 before,during,and after
var after = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
  .filterDate('2026-04-10', '2026-04-25')
  .filterBounds(aoi)
  .filter(ee.Filter.lt('CLOUD_COVER', 10))
  .first()


var before = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
  .filterDate('2025-04-01', '2025-04-25')
  .filterBounds(aoi)
  .filter(ee.Filter.lt('CLOUD_COVER', 10))
  .first()

//Scale SR bands to surface reflectance
function scaleBands(img){
  var opt = img.select('SR_B.').multiply(0.0000275).add(-0.2)
  return img.addBands(opt,null,true)
}

var afterclip = scaleBands(after.clip(aoi))
var beforeclip = scaleBands(before.clip(aoi))


//True-color visualization (SWIR/NIR/Red)
var vis = {
  bands: ['SR_B7', 'SR_B5', 'SR_B3'],
  min: 0.0,
  max: 0.3,
};

Map.addLayer(beforeclip,vis,'Before',true)
Map.addLayer(afterclip,vis,'After',true)

//MNDWI (Green,SWIR1) computed
var mndwi25 = beforeclip.normalizedDifference(['SR_B3', 'SR_B6']).rename('mndwi25')
var mndwi26 = afterclip.normalizedDifference(['SR_B3', 'SR_B6']).rename('mndwi26')

//Boolean water masks
var water25 = mndwi25.gt(0)
var water26 = mndwi26.gt(0)
var change = water26.subtract(water25).gt(0)
var changemask = change.updateMask(change)

//Continous change (for correlation against SMAP)
var mndwiChange = mndwi26.subtract(mndwi25).rename('mndwi_change')


Map.addLayer(changemask, {palette: ['FF0000']}, 'Flood Change (new water)')
Map.addLayer(mndwiChange, {min: -1, max:1, palette: ['red', 'white', 'blue']}, 'MNDWI Change(continous')


//Export image as a GeoTIFF for use in QGIS
Export.image.toDrive({
  image: changemask.clip(aoi),
  description: 'Landsat9Change',
  folder: 'GoogleEarthEngine',
  region: aoi,
  scale: 30,
  crs: 'EPSG:4326',
  fileFormat: 'GeoTIFF'
})

Export.image.toDrive({
  image: mndwiChange.clip(aoi),
  description: 'LandsatMNDWIChange',
  folder: 'GoogleEarthEngine',
  region: aoi,
  scale: 30,
  crs: 'EPSG:4326',
  fileFormat: 'GeoTIFF'
})

//Flooded area calculation
var floodedMeters = changemask.multiply(ee.Image.pixelArea())
var stats = floodedMeters.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: aoi,
  scale:30,
  maxPixels: 1e9
})

var areaM2 = stats.get('mndwi26')
var areaKM2 = ee.Number(areaM2).divide(1000000)
var areaMI = ee.Number(areaKM2).multiply(0.386102)

print('Flooded area (sq meters):', areaM2)
print('Flooded area (sq km):', areaKM2)
print('Flooded area (sq mi):', areaMI)
