var counties = ee.FeatureCollection('TIGER/2018/Counties')
  .filter(ee.Filter.eq('STATEFP', '26'));

var upCounties = [
  'Alger', 'Baraga', 'Chippewa', 'Delta', 'Dickinson', 'Gogebic', 
  'Houghton', 'Iron', 'Keweenaw', 'Luce', 'Mackinac', 'Marquette', 
  'Menominee', 'Ontonagon', 'Schoolcraft'
];
var lpCounties = counties.filter(ee.Filter.inList('NAME', upCounties).not());
var geometry = lpCounties.geometry();

var grLon = -85.6681;
var grLat = 42.9634;
var grandRapids = ee.Geometry.Point([grLon, grLat])

var grMarker = grandRapids.buffer(8000)


var landMask = ee.Image('MODIS/MOD44W/MOD44W_005_2000_02_24')
  .select('water_mask')
  .eq(0); 

var snowVis = {
  min: 0,
  max: 100,
  palette: ['black', 'lightblue', 'blue', 'white']
}
var s2Vis = {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 0.2
}

//Determine Dates of Snow Cover
var startDate = '2022-01-01'
var endDate = '2022-03-15'

//Load MODIS through Terra Satellite
var terra = ee.ImageCollection('MODIS/061/MOD10A1')
      .filterDate(startDate,endDate)
      .filterBounds(geometry)
      .select(['NDSI_Snow_Cover', 'NDSI_Snow_Cover_Basic_QA'])
      
//Load MODIS through Aqua Satellite      
var aqua = ee.ImageCollection('MODIS/061/MYD10A1')
      .filterDate(startDate, endDate)
      .filterBounds(geometry)
      .select(['NDSI_Snow_Cover', 'NDSI_Snow_Cover_Basic_QA'])
      
//Merge raw MODIS data (terra and aqau)
var modisRaw = terra.merge(aqua)

//Aggregate into weekly steps
var start = new Date (startDate)
var end = new Date (endDate)
var weeklyList = []

//Mask out non-snow values (clouds and lake ice)
var maskSnow = function(img){
  var qa = img.select('NDSI_Snow_Cover_Basic_QA')
  var moreMask = qa.lte(1)
  //var cloudMask = qa.neq(4)
  var ndsi = img.select('NDSI_Snow_Cover')
  return ndsi.updateMask(moreMask).updateMask(ndsi.lte(100))
  
}


// 5. Generate a List of Days
var eeStart = ee.Date(startDate);
var eeEnd = ee.Date(endDate);
var totalDays = eeEnd.difference(eeStart, 'days').round();
var daysList = ee.List.sequence(0, totalDays.subtract(1));

// 6. Map Over the Days to Get Daily Composites
var dailyCollection = ee.ImageCollection(daysList.map(function(dayOffset) {
  var currentDay = eeStart.advance(ee.Number(dayOffset), 'day');
  var nextDay = currentDay.advance(1, 'day');
  
  // Filter raw data for just this single day, mask it, and take the max
  var dayImage = modisRaw.filterDate(currentDay, nextDay)
                         .map(maskSnow)
                         .median() // Best daily value if both satellites passed over
                         .clip(geometry)
                         .set('system:time_start', currentDay.millis());
                         
  return dayImage;
}));

//Work through each week of data
for (var d = start; d < end; d.setDate(d.getDate()+ 7)){
  var currentWeekStart = ee.Date(d.toISOString().split('T')[0])
  var currentWeekEnd = currentWeekStart.advance(7,'day')
  
  var weeklyMean = modisRaw.filterDate(currentWeekStart, currentWeekEnd)
                          .map(maskSnow)
                          .median()
                          .clip(geometry)
                          .set('system:time_start', currentWeekStart.millis())
                          .set('date_string', currentWeekStart.millis())
  var cleanDateString = currentWeekStart.format('YYYY-MM-DD')
  weeklyMean = weeklyMean.set('date_string', cleanDateString)
  weeklyList.push(weeklyMean)
}


var weeklyCollection = ee.ImageCollection.fromImages(weeklyList)    
print(weeklyCollection)
Map.addLayer(weeklyCollection.first(), snowVis, 'Weekly snow cover example')

var eeStart = ee.Date(startDate);
var eeEnd = ee.Date(endDate);
var totalDays = eeEnd.difference(eeStart, 'days').round();

var dailyList = ee.List.sequence(0, totalDays.subtract(1)).map(function(dayOffset) {
  var currentDayStart = eeStart.advance(ee.Number(dayOffset), 'day');
  var currentDayEnd = currentDayStart.advance(1, 'day');
  
  var tDay = terra.filterDate(currentDayStart, currentDayEnd);
  var aDay = aqua.filterDate(currentDayStart, currentDayEnd);
  
  var dayMax = tDay.merge(aDay)
                  .map(maskSnow)
                  .median()
                  .clip(geometry)
                  .set('system:time_start', currentDayStart.millis())
                  .set('date_string', currentDayStart.format('YYYY-MM-DD'));

  return dayMax;
});

var dailyCollection = ee.ImageCollection(dailyList);
print('Daily Collection Baseline:', dailyCollection);
Map.addLayer(dailyCollection.first(), snowVis, 'Daily snow cover example')
var chart2025 = ui.Chart.image.series({
  imageCollection: dailyCollection,
  region: geometry,
  reducer: ee.Reducer.mean(),
  scale: 500,
  xProperty: 'system:time_start'
}).setOptions({
  title: '2025 Weekly Snow Cover (Jan - Apr)',
  vAxis: {
    title: 'Mean NDSI Snow Cover (%)', 
    maxValue: 100, 
    minValue: 0
  },
  hAxis: {
    title: 'Date', 
    format: 'MM-dd',
    gridlines: {count: 8}
  },
  lineWidth: 2,
  pointSize: 2,
  colors: ['#0055ff'] // High-visibility blue line
});

// Print the chart to the Console tab
print(chart2025);

//Generate a GIF
var gifmeltStart = '2022-01-01'
var gifmeltEnd = '2022-03-15'

var gifStart = new Date(gifmeltStart)
var gifEnd = new Date(gifmeltEnd)
var gifImageList = []

for (var g = gifStart; g < gifEnd; g.setDate(g.getDate() + 1)) {
  var currentDay = ee.Date(g.toISOString().split('T')[0]);
  var nextDay = currentDay.advance(1, 'day');
  
  var tDay = terra.filterDate(currentDay, nextDay);
  var aDay = aqua.filterDate(currentDay, nextDay);
  
  var dayMax = tDay.merge(aDay)
                  .map(maskSnow)
                  .max()
                  .clip(geometry)
                  .set('system:time_start', currentDay.millis())
  gifImageList.push(dayMax);
}

var dailyCollection = ee.ImageCollection.fromImages(gifImageList);
print(dailyCollection)



Map.addLayer(dailyCollection.first(), snowVis, 'Daily snow cover example')

// New attempt for Sen-2
function maskS2clouds(image) {
  var qa = image.select('QA60');

  // Bits 10 and 11 are clouds and cirrus, respectively.
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));

  return image.updateMask(mask).divide(10000);
}

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                  .filterDate(gifmeltStart, gifmeltEnd)
                  // Pre-filter to get less cloudy granules.
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE',20))
                  .map(maskS2clouds)
                  .median()
                  .clip(geometry)

Map.addLayer(s2, s2Vis, 'Sentinel-2 Composite')

var s2VisGif = s2.visualize({
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 0.2
})


var gifCollection = weeklyCollection.map(function(img){ 
  var snowVisualized = img.visualize(snowVis)
  var blended = s2VisGif.blend(snowVisualized).updateMask(landMask)
  
  return blended
})

var gifParams = {
  region: geometry,
  dimensions: 600,
  framesPerSecond: 2,
  format: 'gif'
}

print(ui.Thumbnail(gifCollection, gifParams));
print(gifCollection.getVideoThumbURL(gifParams));
print("Animation Frame Date Order:", weeklyCollection.aggregate_array('date_string'));


