//Study area and date range
var bufferedGeometry = geometry.buffer(5000); // 5000 meters = 5km
Map.centerObject(bufferedGeometry, 10);
var startDate = ee.Date('2025-01-01')
var endDate = ee.Date('2025-05-01')

//Spatial Footprint
var smapGrid = ee.Image(ee.ImageCollection("NASA/SMAP/SPL4SMGP/008").first()).projection();

//Land cover dataset to remote cities, water, and snow/ice
var worldCover = ee.ImageCollection("ESA/WorldCover/v100").first();
var detailedFeatures = worldCover.eq(50).or(worldCover.eq(80))
//Creating mask where 50 = build up, 70=snow and ice, 80= permanent water
var cleanLandMask = worldCover.neq(50)
  .and(worldCover.neq(70))
  .and(worldCover.neq(80))
  .reproject({crs: smapGrid})
  // Smooth the mask out slightly 
  .reduceResolution({
    reducer: ee.Reducer.mean(),
    maxPixels: 65535
  })
    .gt(0.5)

//Insert Image and SMAP Soil Moisture data
var data = ee.ImageCollection("NASA/SMAP/SPL4SMGP/008")
  .select('sm_surface_wetness')
  .filterBounds(geometry)
  .filterDate(startDate, endDate)
  .map(function(img){ 
    var maskedImg = img.updateMask(img.neq(-9999)).updateMask(cleanLandMask)
    return img.updateMask(img.neq(-9999))
              //.updateMask(cleanLandMask)
              .clip(geometry)
  })
  
var soilMoisture = data.select('sm_surface_wetness')
var soilMoistureVis = {
  min: 0,
  max: 1,
  palette: [
    'd7c29e', //dry
    'ffebaf', 
    '85b669', 
    '1d6b99',
    '002b5c' //wet
    ]
};

//Generate a list of dates between the start and end dates
var diffDays = endDate.difference(startDate, 'day');
var dateList = ee.List.sequence(0, diffDays.subtract(1)).map(function(dayOffset) {
  return startDate.advance(dayOffset, 'day');
});


//Daily max composite for each day
var dailyCollection = ee.ImageCollection(dateList.map(function(date){
  var d = ee.Date(date)
  var dayCol = data.filterDate(d, d.advance(1, 'day'))
  return dayCol.first().set('system:time_start', d.millis())
})).filter(ee.Filter.notNull(['system:time_start']))



var visual = dailyCollection.map(function(img){
  return img.visualize(soilMoistureVis)
})

var gifParams = {
  region: geometry,
  dimensions: 500,
  framesPerSecond: 5,
  crs: 'EPSG:4326',
  format: 'gif'
}


//Map over the date list to create a daily max composite for each day
var soilMoistureMax = ee.ImageCollection(dateList.map(function(date) {
  var d = ee.Date(date);
  
  //Filter for images strictly on this specific calendar day
  var dayCol = data.filterDate(d, d.advance(1, 'day'));
  
  //Apply the max reducer and add the system:time_start property back
  return dayCol.max()
               .set('system:time_start', d.millis());
}));

print('Daily Max Image Collection:', soilMoistureMax);
var chart = ui.Chart.image.series({
  imageCollection: soilMoistureMax,
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 25000,
  xProperty:'system:time_start'
})

print(soilMoisture.size())
print(soilMoisture.aggregate_array('system:time_start')
  .map(function(d){return ee.Date(d).format('YYYY-MM-dd HH:mm:SS')}))
print(chart)

Map.addLayer(dailyCollection)


var stackedBands = soilMoistureMax.map(function(img){
  var dateStr = ee.Date(img.get('system:time_start')).format('YYYY_MM_dd')
  return img.rename(dateStr)
}).toBands()



Export.image.toDrive({
  image: stackedBands,
  description: 'SMAP_2026_QGIS',
  scale: 9000,
  region: geometry,
  crs: 'EPSG:4326',
  maxPixels: 1e9
})

print('2026 SMAP Soil Moisture:', ui.Thumbnail(visual, gifParams))

  
