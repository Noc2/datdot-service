const RAM = require('random-access-memory')
const SDK = require('dat-sdk')
const p2plex = require('p2plex')
const ndjson = require('ndjson')
const pump = require('pump')
const { PassThrough } = require('stream')

const Encoder = require('./')
const EncoderDecoder = require('../EncoderDecoder')
const { ENCODING_RESULTS_STREAM } = require('../constants')

run()

async function run () {
  const sdk1 = await SDK({
    storage: RAM
  })
  const sdk2 = await SDK({
    storage: RAM
  })

  const plex = p2plex()

  const encoder = await Encoder.load({
    sdk: sdk1,
    EncoderDecoder
  })

  const TEST_MESSAGE = Buffer.from('Hello World!')

  plex.on('connection', async (peer) => {
    console.log('Got connection from encoder', peer.publicKey, peer.publicKey.equals(encoder.publicKey))

    peer.on('stream', (stream, id) => console.log('Got stream from encoder', id))

    const responseStream = ndjson.serialize()
    const rawEncodingStream = ndjson.parse()
    // This is needed to make the stream async iterable
    const encodingStream = new PassThrough({ objectMode: true })

    pump(responseStream, peer.receiveStream(ENCODING_RESULTS_STREAM), rawEncodingStream, encodingStream)
    encodingStream.resume()

    for await (const { feed, index, encoded } of encodingStream) {
      const encodedBuff = Buffer.from(encoded)
      const feedBuff = Buffer.from(feed)

      const decoded = await EncoderDecoder.decode(encodedBuff)
      const isSame = TEST_MESSAGE.equals(decoded)
      const decodedString = decoded.toString('utf8')

      console.log('Got encoding', {
        feedBuff,
        index,
        encodedBuff,
        decoded,
        isSame,
        decodedString
      })

      // Respond to the peer saying we got the data
      responseStream.write({
        type: 'encoding',
        ok: true
      })
    }
  })

  console.log('initializing feed')
  const feed = sdk2.Hypercore('Example Feed')

  await feed.append(TEST_MESSAGE)
  await feed.append(TEST_MESSAGE)

  const ranges = [[0, 1]]

  console.log('Sending feed to be encoded', {
    publicKey: plex.publicKey.toString('hex'),
    feed: feed.key.toString('hex'),
    ranges
  })

  await encoder.encodeFor(plex.publicKey, feed.key, ranges)

  console.log('Done!')
  console.log('Cleaning up')

  await Promise.all([
    encoder.close(),
    sdk1.close(),
    sdk2.close(),
    plex.destroy()
  ])

  console.log('Cleaned up')
}
