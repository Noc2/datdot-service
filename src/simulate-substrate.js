const DB = require('./DB')
const handlers = []

module.exports = {
  create: () => ({
    query: {
      system: { events: handler => handlers.push(handler) },
      datVerify: {
        getUserByID,
        getFeedByID,
        getPlanByID,
        getContractByID,
        getChallengeByID,
        getAttestationByID,
      }
    },
    tx: { datVerify: {
      newUser,
      registerEncoder,
      registerAttestor,
      registerHoster,
      publishFeedAndPlan,
      encodingDone,
      hostingStarts,
      requestProofOfStorageChallenge,
      requestAttestation,
      submitProofOfStorage,
      submitAttestationReport
      }
    }
  })
}
/******************************************************************************
  TRANSACTIONS (=EXTRINSICS)
******************************************************************************/
async function newUser (...args) { return { signAndSend: signAndSend.bind({ args, type: 'newUser' }) } }
async function registerEncoder (...args) { return { signAndSend: signAndSend.bind({ args, type: 'registerEncoder' }) } }
async function registerAttestor (...args) { return { signAndSend: signAndSend.bind({ args, type: 'registerAttestor' }) } }
async function registerHoster (...args) { return { signAndSend: signAndSend.bind({ args, type: 'registerHoster' }) } }
async function publishFeedAndPlan (...args) { return { signAndSend: signAndSend.bind({ args, type: 'publishFeedAndPlan'}) } }
async function encodingDone (...args) { return { signAndSend: signAndSend.bind({ args, type: 'encodingDone'}) } }
async function hostingStarts (...args) { return { signAndSend: signAndSend.bind({ args, type: 'hostingStarts'}) } }
async function requestProofOfStorageChallenge (...args) { return { signAndSend: signAndSend.bind({ args, type: 'requestProofOfStorageChallenge'}) } }
async function requestAttestation (...args) { return { signAndSend: signAndSend.bind({ args, type: 'requestAttestation'}) } }
async function submitProofOfStorage (...args) { return { signAndSend: signAndSend.bind({ args, type: 'submitProofOfStorage'}) } }
async function submitAttestationReport (...args) { return { signAndSend: signAndSend.bind({ args, type: 'submitAttestationReport'}) } }
/******************************************************************************
  QUERIES
******************************************************************************/
function getFeedByID (id) { return DB.feeds[id - 1] }
function getUserByID (id) { return DB.users[id - 1] }
function getPlanByID (id) { return DB.plans[id - 1] }
function getContractByID (id) { return DB.contracts[id - 1] }
function getChallengeByID (id) { return DB.challenges[id - 1] }
function getAttestationByID (id) { return DB.attestations[id - 1] }

/******************************************************************************
  ROUTING (sign & send)
******************************************************************************/
function signAndSend (signer, { nonce }, status) {
  const { type, args } = this
  status({ events: [], status: { isInBlock:1 } })

  const user = _newUser(signer, { nonce }, status)
  if (!user) return console.error('NO USER', user)

  if (type === 'publishFeedAndPlan') _publishFeedAndPlan(user, { nonce }, status, args)
  else if (type === 'registerEncoder') _registerEncoder(user, { nonce }, status, args)
  else if (type === 'registerAttestor') _registerAttestor(user, { nonce }, status, args)
  else if (type === 'registerHoster') _registerHoster(user, { nonce }, status, args)
  else if (type === 'encodingDone') _encodingDone(user, { nonce }, status, args)
  else if (type === 'hostingStarts') _hostingStarts(user, { nonce }, status, args)
  else if (type === 'requestProofOfStorageChallenge') _requestProofOfStorageChallenge(user, { nonce }, status, args)
  else if (type === 'requestAttestation') _requestAttestation(user, { nonce }, status, args)
  else if (type === 'submitProofOfStorage') _submitProofOfStorage(user, { nonce }, status, args)
  else if (type === 'submitAttestationReport') _submitAttestationReport(user, { nonce }, status, args)
  // else if ...
}
/******************************************************************************
  API
******************************************************************************/
function _newUser (address, { nonce }, status) {
  let user
  if (DB.userByAddress[address]) {
    const pos = DB.userByAddress[address] - 1
    user = DB.users[pos]
  }
  else {
    user = { address: address }
    const userID = DB.users.push(user)
    user.id = userID
    // push to userByAddress lookup array
    DB.userByAddress[address] = userID
  }
  return user
}
async function _publishFeedAndPlan (user, { nonce }, status, args) {
  // Publish FEED
  //@TODO check if feed already exists
  const [ merkleRoot, plan ] = args
  const [key, {hashType, children}, signature] = merkleRoot
  const feed = { publickey: key.toString('hex'), meta: { signature, hashType, children } }
  const feedID = DB.feeds.push(feed)
  feed.id = feedID
  // push to feedByKey lookup array
  DB.feedByKey[key.toString('hex')] = feedID
  // Emit event
  const NewFeed = { event: { data: [feedID], method: 'NewFeed' } }
  handlers.forEach(handler => handler([NewFeed]))

// Publish PLAN
  const userID = DB.userByAddress[user.address]
  plan.publisher = userID
  plan.feed = feedID
  const planID = DB.plans.push(plan)
  plan.id = planID
  // Add planID to unhostedPlans
  DB.unhostedPlans.push(planID)
  // Find hoster & encoder
  makeNewContract({encoderID: null, hosterID: null, planID: planID})
  // Emit event
  const NewPlan = { event: { data: [planID], method: 'NewPlan' } }
  handlers.forEach(handler => handler([NewPlan]))
}
async function _registerHoster(user, { nonce }, status, args) {
  const [hosterKey] = args
  const userID = DB.userByAddress[user.address]
  DB.users[userID - 1].hosterKey = hosterKey
  DB.hosters.push(userID)
  makeNewContract({ encoderID: null, hosterID: userID, planID: null})
}
async function _registerEncoder (user, { nonce }, status, args) {
  const [encoderKey] = args
  const userID = DB.userByAddress[user.address]
  DB.users[userID - 1].encoderKey = encoderKey
  DB.encoders.push(userID)
  makeNewContract({ encoderID: userID, hosterID: null, planID: null})
}
async function _registerAttestor (user, { nonce }, status) {
  const userID = DB.userByAddress[user.address]
  DB.attestors.push(userID)
}
async function _encodingDone (user, { nonce }, status, args) {
  const [ contractID ] = args
  DB.contractsEncoded.push(contractID)
}
async function _hostingStarts (user, { nonce }, status, args) {
  const [ contractID ] = args
  DB.contractsHosted.push(contractID)
  const HostingStarted = { event: { data: [contractID], method: 'HostingStarted' } }
  handlers.forEach(handler => handler([HostingStarted]))
}
async function _requestProofOfStorageChallenge (user, { nonce }, status, args) {
  const [ contractID ] = args
  const ranges = DB.contracts[contractID - 1].ranges // [ [0, 3], [5, 7] ]
  const chunks = ranges.map(range => getRandomInt(range[0], range[1] + 1))
  const challenge = { contract: contractID, chunks }
  const challengeID = DB.challenges.push(challenge)
  challenge.id = challengeID
  // emit events
  const newChallenge = { event: { data: [challengeID], method: 'NewProofOfStorageChallenge' } }
  handlers.forEach(handler => handler([newChallenge]))
}
async function _submitProofOfStorage (user, { nonce }, status, args) {
  const [ challengeID, proof ] = args
  const challenge = DB.challenges[challengeID - 1]
  const isValid = validateProof(proof, challenge)
  let proofValidation
  const data = [challengeID]
  console.log('Submitting Proof Of Storage Challenge with ID:', challengeID)
  if (isValid) proofValidation = { event: { data, method: 'ProofOfStorageConfirmed' } }
  else proofValidation = { event: { data: [challengeID], method: 'ProofOfStorageFailed' } }
  // emit events
  handlers.forEach(handler => handler([proofValidation]))
}
async function _requestAttestation (user, { nonce }, status, args) {
  const [ contractID ] = args
  const [ attestorID ] = getRandom(DB.attestors)
  const attestation = { contract: contractID , attestor: attestorID }
  const attestationID = DB.attestations.push(attestation)
  attestation.id = attestationID
  const PoRChallenge = { event: { data: [attestationID], method: 'newAttestation' } }
  handlers.forEach(handler => handler([PoRChallenge]))
}
async function _submitAttestationReport (user, { nonce }, status, args) {
  const [ attestationID, report ] = args
  console.log('Submitting Proof Of Retrievability Attestation with ID:', attestationID)
  // emit events
  if (report) PoR = { event: { data: [attestationID], method: 'AttestationReportConfirmed' } }
  else PoR = { event: { data: [attestationID], method: 'AttestationReportFailed' } }
  handlers.forEach(handler => handler([PoR]))
}

/******************************************************************************
  HELPERS
******************************************************************************/
function getRandom (items) {
  if (!items.length) return
  const pos = Math.floor(Math.random() * items.length)
  const item = items[pos]
  return [item, pos]
}
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}
function validateProof (proof, challenge) {
  const chunks = challenge.chunks
  console.log('Validating the proof of storage for chunks:', chunks)
  const proofChunks = proof.map(chunkProof => chunkProof.index)
  if (`${chunks}` === `${proofChunks}`) return true
  else return false
}
function makeNewContract (opts) {
  // Find an unhosted plan
  let { encoderID, hosterID, planID } = opts
  const unhosted = DB.unhostedPlans
  if (!planID && unhosted.length) [planID] = getRandom(unhosted)
  const selectedPlan = DB.plans[planID - 1]
  if (!selectedPlan) return console.log('current lack of demand for hosting plans')

  // Pair hoster and encoder
  if (hosterID && DB.encoders.length) [encoderID] = getRandom(DB.encoders)
  else if (encoderID && DB.hosters.length) [hosterID] = getRandom(DB.hosters)
  else if (!hosterID && !encoderID && DB.encoders.length && DB.hosters.length) {
    [encoderID] = getRandom(DB.encoders)
    [hosterID] = getRandom(DB.hosters)
  }
  if (!encoderID) return console.log('missing encoder')
  if (!hosterID) return console.log('missing hoster')

  // Make a new contract
  const contract = {
    plan: planID,
    ranges: [ [0, 3], [5, 7] ],
    encoder: encoderID,
    hoster: hosterID
  }
  const contractID = DB.contracts.push(contract)
  contract.id = contractID

  // remove planID from unhostedPlans
  // when all contracts for certain plan are hosted => push planID to hostedPlans
  DB.unhostedPlans.splice(planID, 1)
  const NewContract = { event: { data: [contractID], method: 'NewContract' } }
  handlers.forEach(handler => handler([NewContract]))

}
