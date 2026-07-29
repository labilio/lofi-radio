const test = require('node:test');
const assert = require('node:assert/strict');
const stations = require('../stations.json');

test('the shipped station catalog excludes the unavailable Chill Sky source', () => {
  assert.equal(stations.some((station) => station.name === 'Chill Sky'), false);
});

test('BBC 3 uses the verified current BBC HLS manifest', () => {
  const station = stations.find((item) => item.name === 'BBC 3');

  assert.ok(station, 'BBC 3 must remain in the station catalog');
  assert.equal(station.type, 'm3u8');
  assert.equal(
    station.url,
    'https://a.files.bbci.co.uk/ms6/live/3441A116-B12E-4D2F-ACA8-C1984642FA4B/audio/simulcast/hls/nonuk/audio_syndication_low_sbr_v1/aks/bbc_radio_three.m3u8'
  );
});

test('the six added direct streams ship with their verified MP3 URLs', () => {
  const expectedCandidates = [
    ['FluxFM ChillHop', 'https://streams.fluxfm.de/Chillhop/mp3-128/streams.fluxfm.de/'],
    ['FluxFM Chillout', 'https://streams.fluxfm.de/chillout/mp3-128/streams.fluxfm.de/'],
    ['Chillsynth FM', 'https://stream.nightride.fm/chillsynth.mp3'],
    ['Lofi Mix', 'https://stream.laut.fm/lofi-radio'],
    ['Lofi Study', 'https://stream.laut.fm/lofi'],
    ['Loungetunes', 'https://stream.laut.fm/loungetunes']
  ];

  assert.equal(stations.length, 21);
  for (const [name, url] of expectedCandidates) {
    const station = stations.find((item) => item.name === name);
    assert.ok(station, `${name} must be present in the station catalog`);
    assert.equal(station.type, 'mp3');
    assert.equal(station.url, url);
  }
});

test('station labels accurately describe the music and use the shared scene vocabulary', () => {
  const expectedLabels = [
    ['Lofi Girl', 'Lo-fi', 'Hip-Hop', '学习'],
    ['Lofi Box', 'Lo-fi', undefined, '学习'],
    ['Chill Wave', 'Chillwave', undefined, '放松'],
    ['Groove Salad', 'Downtempo', 'Ambient', '工作'],
    ['ASP', 'Ambient', 'Beat-free', '助眠'],
    ['Paradise', 'Mellow', 'Eclectic', '放松'],
    ['Drone Zone', 'Drone', 'Ambient', '助眠'],
    ['Rain Sounds', 'Rain', 'Thunderstorm', '助眠'],
    ['Jazz Box', 'Jazz', undefined, '阅读'],
    ['Jazz Groove', 'Jazz', 'Laid-back', '工作'],
    ['Jazz Smooth', 'Jazz', 'Soul', '工作'],
    ['Swiss Classic', 'Classical', undefined, '学习'],
    ['BBC 3', 'Classical', 'Jazz', '探索'],
    ['Rap', 'Hip-Hop', 'Rap', '运动'],
    ['KEXP', 'Rock', 'Eclectic', '探索'],
    ['FluxFM ChillHop', 'Chillhop', 'Lo-fi', '学习'],
    ['FluxFM Chillout', 'Chillout', undefined, '工作'],
    ['Chillsynth FM', 'Chillsynth', 'Synthwave', '工作'],
    ['Lofi Mix', 'Lo-fi', 'Lounge', '工作'],
    ['Lofi Study', 'Lo-fi', 'Chillout', '学习'],
    ['Loungetunes', 'Jazzhop', 'Chillhop', '阅读']
  ];

  assert.deepEqual(
    stations.map(({ name, style1, style2, scene }) => [name, style1, style2, scene]),
    expectedLabels
  );
  assert.deepEqual(
    [...new Set(stations.map(({ scene }) => scene))].sort(),
    ['学习', '工作', '探索', '放松', '助眠', '运动', '阅读'].sort()
  );
});
