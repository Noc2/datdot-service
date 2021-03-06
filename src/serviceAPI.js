const debug = require('debug')

module.exports = datdotService

function datdotService () {
  const NAME = __filename.split('/').pop().split('.')[0].toLowerCase()
  const log = debug(`${NAME}]`)

  const serviceAPI = {
    host,
    encode,
    getProofOfStorage,
    attest,
  }
  return serviceAPI

  function host (data) {
    const {hoster, feedKey: feedKeyBuffer , encoderKey, plan} = data
    log('start hosting')
    return hoster.hostFeed(feedKeyBuffer, encoderKey, plan)
  }

  function encode (data) {
    const { encoder, hosterKey, feedKey: feedKeyBuffer, ranges } = data
    log('start encoding')
    return encoder.encodeFor(hosterKey, feedKeyBuffer, ranges)
  }

  async function getProofOfStorage (data) {
    const { account, challenge, feedKey } = data
    const proof = await Promise.all(challenge.chunks.map(async (chunk) => {
      return await account.hoster.getProofOfStorage(feedKey, chunk)
    }))
    return proof
  }

  async function attest (data) {
    const { account, randomChunks, feedKey } = data
    const report = await Promise.all(randomChunks.map(async (chunk) => {
      return await account.attestor.attest(feedKey, chunk)
    }))
    return report
  }

}
