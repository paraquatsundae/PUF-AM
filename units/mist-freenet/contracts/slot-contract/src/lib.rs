//! PUF-AM mist **join slot** — a Freenet 0.2 contract a short ticket can address.
//!
//! The bundled pack contract sets `parameters = blake3(state)`, so its address is
//! a function of its content. That is right for immutable blobs and useless for a
//! lookup: a joiner holding only `PUF-XXXX-XXXX` cannot compute where to look,
//! because the address would depend on the bytes it is trying to fetch.
//!
//! This contract breaks that circle by putting a **derived slot id** in
//! `parameters` instead. Both sides compute
//! `slot_id = HKDF(FarmSeed, "freenet-join-slot:" ‖ ticket)` from things they
//! already hold — the owner after publishing, the joiner after FarmCode recovery —
//! so `id = blake3(code_hash ‖ parameters)` lands on the same address on both
//! machines without either of them talking to the other.
//!
//! ## Parameters (64 bytes, exactly)
//!
//! ```text
//!  0..32  slot_id        derived per (farm, ticket)
//! 32..64  verifying_key  ed25519 public key derived per farm
//! ```
//!
//! The verifying key has to be in `parameters` rather than in the state: it is
//! what makes the address unforgeable. If it lived in the state, anyone could put
//! their own key at the same address and serve their own manifest.
//!
//! ## State
//!
//! ```text
//!  0..8   magic        b"PUFSLOT1"
//!  8..16  seq          u64 little-endian, strictly increasing
//! 16..20  payload_len  u32 little-endian
//! 20..84  signature    ed25519 over the signing message below
//! 84..    payload      AEAD-sealed join manifest (opaque here)
//! ```
//!
//! Signing message: `b"pufam-join-slot-v1" ‖ slot_id ‖ seq_le ‖ payload`.
//!
//! `slot_id` is inside the signature so a state signed for one ticket cannot be
//! replayed into another ticket's slot — the two slots of one farm share a
//! verifying key, so without this binding the signature would still check out.
//!
//! The payload is opaque to this contract on purpose. It is AEAD-sealed under a
//! FarmSeed-derived key, so the network stores a pointer nobody but a FarmCode
//! holder can read, and the contract needs no farm secret to police writes.
//!
//! ## What this does and does not protect
//!
//! Only a holder of the farm signing key can write a slot, so a peer that learns
//! the address by watching a PUT cannot replace the manifest with its own. It is
//! **not** an owner-vs-crew boundary: the signing key comes from the FarmSeed, so
//! anyone with the FarmCode can write. That matches the rest of mist, where
//! `role` is an authority label rather than a crypto boundary.

use ed25519_dalek::{Signature, VerifyingKey};
use freenet_stdlib::prelude::*;

/// Bumping this is a wire break: it changes every signature and every state.
const MAGIC: &[u8; 8] = b"PUFSLOT1";

/// Domain separator, so a farm signing key cannot be tricked into signing
/// something that means one thing here and another elsewhere in mist.
const SIGNING_DOMAIN: &[u8] = b"pufam-join-slot-v1";

const SLOT_ID_LEN: usize = 32;
const VERIFYING_KEY_LEN: usize = 32;
const PARAMETERS_LEN: usize = SLOT_ID_LEN + VERIFYING_KEY_LEN;

const SIGNATURE_LEN: usize = 64;
const HEADER_LEN: usize = 8 + 8 + 4 + SIGNATURE_LEN;

/// A join manifest is a few hundred bytes; its AEAD envelope is a couple of
/// kilobytes at worst. The ceiling is here so a slot cannot be turned into free
/// storage at an address the owner cannot rotate.
const MAX_PAYLOAD_LEN: usize = 16 * 1024;

struct SlotParameters {
    slot_id: [u8; SLOT_ID_LEN],
    verifying_key: VerifyingKey,
}

fn parse_parameters(parameters: &[u8]) -> Result<SlotParameters, ContractError> {
    if parameters.len() != PARAMETERS_LEN {
        return Err(ContractError::InvalidState);
    }

    let mut slot_id = [0u8; SLOT_ID_LEN];
    slot_id.copy_from_slice(&parameters[..SLOT_ID_LEN]);

    let mut key_bytes = [0u8; VERIFYING_KEY_LEN];
    key_bytes.copy_from_slice(&parameters[SLOT_ID_LEN..PARAMETERS_LEN]);

    // A non-canonical or small-order point is a bad key, not a bad state, but the
    // contract has one error to report either way.
    let verifying_key = VerifyingKey::from_bytes(&key_bytes).map_err(|_| ContractError::InvalidState)?;

    Ok(SlotParameters {
        slot_id,
        verifying_key,
    })
}

/// Authenticate one slot state and return its sequence number.
///
/// `None` is anything a peer should refuse to store — a malformed header, a bad
/// length, a signature that does not check out. The payload itself is never
/// returned because this contract has no business reading it; the sequence number
/// is the only field it needs in order to order two states.
fn verified_seq(params: &SlotParameters, state: &[u8]) -> Option<u64> {
    if state.len() < HEADER_LEN {
        return None;
    }
    if &state[..8] != MAGIC {
        return None;
    }

    let seq = u64::from_le_bytes(state[8..16].try_into().ok()?);
    let payload_len = u32::from_le_bytes(state[16..20].try_into().ok()?) as usize;
    if payload_len > MAX_PAYLOAD_LEN {
        return None;
    }
    // Exact, not "at least": trailing bytes would be unsigned space a relay could
    // grow without invalidating the signature.
    if state.len() != HEADER_LEN + payload_len {
        return None;
    }

    let signature_bytes: [u8; SIGNATURE_LEN] = state[20..HEADER_LEN].try_into().ok()?;
    let payload = &state[HEADER_LEN..];

    let mut message =
        Vec::with_capacity(SIGNING_DOMAIN.len() + SLOT_ID_LEN + 8 + payload.len());
    message.extend_from_slice(SIGNING_DOMAIN);
    message.extend_from_slice(&params.slot_id);
    message.extend_from_slice(&seq.to_le_bytes());
    message.extend_from_slice(payload);

    params
        .verifying_key
        .verify_strict(&message, &Signature::from_bytes(&signature_bytes))
        .ok()?;

    Some(seq)
}

/// Full state bytes carried by one update, whichever shape it arrived in.
///
/// A slot is small enough that a delta is never worth encoding, so
/// `get_state_delta` emits whole states and this treats `Delta` and `State`
/// identically. Related-contract variants have no meaning for a slot.
fn candidate_bytes<'a>(data: &'a UpdateData<'a>) -> Option<&'a [u8]> {
    match data {
        UpdateData::State(state) => Some(state.as_ref()),
        UpdateData::Delta(delta) => Some(delta.as_ref()),
        UpdateData::StateAndDelta { state, .. } => Some(state.as_ref()),
        _ => None,
    }
}

struct SlotContract;

#[contract]
impl ContractInterface for SlotContract {
    fn validate_state(
        parameters: Parameters<'static>,
        state: State<'static>,
        _related: RelatedContracts<'static>,
    ) -> Result<ValidateResult, ContractError> {
        let params = parse_parameters(parameters.as_ref())?;
        match verified_seq(&params, state.as_ref()) {
            Some(_) => Ok(ValidateResult::Valid),
            None => Ok(ValidateResult::Invalid),
        }
    }

    fn update_state(
        parameters: Parameters<'static>,
        state: State<'static>,
        data: Vec<UpdateData<'static>>,
    ) -> Result<UpdateModification<'static>, ContractError> {
        let params = parse_parameters(parameters.as_ref())?;

        let current = state.as_ref().to_vec();
        let mut best_seq = verified_seq(&params, &current);
        let mut best = current;

        for update in &data {
            let Some(bytes) = candidate_bytes(update) else {
                continue;
            };
            // An empty delta is how `get_state_delta` says "you are already current".
            if bytes.is_empty() {
                continue;
            }

            let Some(seq) = verified_seq(&params, bytes) else {
                // A signature that does not check out is not an error the requester
                // can fix by retrying, and refusing the whole update would let one
                // bad peer block a good one in the same batch. Drop it.
                continue;
            };

            // Strictly greater: equal sequence numbers must not be able to swap the
            // payload, or a replayed old state could win a race with the current one.
            if best_seq.is_none_or(|best| seq > best) {
                best_seq = Some(seq);
                best = bytes.to_vec();
            }
        }

        if best_seq.is_none() {
            // Nothing valid to hold: neither the state on disk nor anything offered.
            return Err(ContractError::InvalidUpdate);
        }

        Ok(UpdateModification::valid(best.into()))
    }

    fn summarize_state(
        parameters: Parameters<'static>,
        state: State<'static>,
    ) -> Result<StateSummary<'static>, ContractError> {
        let params = parse_parameters(parameters.as_ref())?;
        // The sequence number is the whole of what a peer needs to know to decide
        // whether it is behind.
        let summary = match verified_seq(&params, state.as_ref()) {
            Some(seq) => seq.to_le_bytes().to_vec(),
            None => Vec::new(),
        };
        Ok(StateSummary::from(summary))
    }

    fn get_state_delta(
        parameters: Parameters<'static>,
        state: State<'static>,
        summary: StateSummary<'static>,
    ) -> Result<StateDelta<'static>, ContractError> {
        let params = parse_parameters(parameters.as_ref())?;
        let Some(our_seq) = verified_seq(&params, state.as_ref()) else {
            return Ok(StateDelta::from(Vec::new()));
        };

        let their_seq = <[u8; 8]>::try_from(summary.as_ref())
            .ok()
            .map(u64::from_le_bytes);

        if their_seq.is_some_and(|seq| seq >= our_seq) {
            return Ok(StateDelta::from(Vec::new()));
        }

        Ok(StateDelta::from(state.as_ref().to_vec()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    const SLOT_ID: [u8; SLOT_ID_LEN] = [7u8; SLOT_ID_LEN];
    const OTHER_SLOT_ID: [u8; SLOT_ID_LEN] = [9u8; SLOT_ID_LEN];

    fn signing_key() -> SigningKey {
        SigningKey::from_bytes(&[42u8; 32])
    }

    fn parameters(slot_id: &[u8; SLOT_ID_LEN], key: &SigningKey) -> Parameters<'static> {
        let mut out = Vec::with_capacity(PARAMETERS_LEN);
        out.extend_from_slice(slot_id);
        out.extend_from_slice(key.verifying_key().as_bytes());
        Parameters::from(out)
    }

    /// Mirrors `encodeJoinSlotState` in `units/mist-freenet/src/freenet02-slot.ts`.
    fn slot_state(
        slot_id: &[u8; SLOT_ID_LEN],
        key: &SigningKey,
        seq: u64,
        payload: &[u8],
    ) -> Vec<u8> {
        let mut message = Vec::new();
        message.extend_from_slice(SIGNING_DOMAIN);
        message.extend_from_slice(slot_id);
        message.extend_from_slice(&seq.to_le_bytes());
        message.extend_from_slice(payload);
        let signature = key.sign(&message);

        let mut out = Vec::with_capacity(HEADER_LEN + payload.len());
        out.extend_from_slice(MAGIC);
        out.extend_from_slice(&seq.to_le_bytes());
        out.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        out.extend_from_slice(&signature.to_bytes());
        out.extend_from_slice(payload);
        out
    }

    fn validate(params: Parameters<'static>, state: Vec<u8>) -> ValidateResult {
        SlotContract::validate_state(params, State::from(state), RelatedContracts::default())
            .expect("validate_state should not error on well-formed parameters")
    }

    fn from_hex(hex: &str) -> Vec<u8> {
        (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hex"))
            .collect()
    }

    /// Byte-for-byte conformance with the TypeScript half.
    ///
    /// These two blobs were produced by `encodeJoinSlotState` /
    /// `joinSlotParameters` in `units/mist-freenet/src/freenet02-slot.ts` for
    /// `slot_id = [7; 32]`, `ed25519 seed = [42; 32]`, `seq = 1`, and the payload
    /// below. Nothing else in either codebase compares the two implementations
    /// directly, and a format drift would otherwise only show up as a joiner in a
    /// shed getting nothing back.
    ///
    /// Regenerate with:
    /// `npx tsx -e "…encodeJoinSlotState({slotId,signingSeed,seq:1n,payload})…"`
    #[test]
    fn matches_the_typescript_encoder_byte_for_byte() {
        const TS_PARAMETERS: &str = "0707070707070707070707070707070707070707070707070707070707070707\
                                     197f6b23e16c8532c6abc838facd5ea789be0c76b2920334039bfa8b3d368d61";
        const TS_STATE: &str = "505546534c4f543101000000000000000f000000d069981915d0b368166b064c3d0e\
                                e16039c9f0362d7635394828d44ac04469d064c2937bf7b673f3e95bd270789ec3a\
                                2a51c1fd89198ba4b1fce6e16e19053007365616c65642d6d616e6966657374";

        let key = signing_key();
        let ts_parameters = from_hex(&TS_PARAMETERS.replace(char::is_whitespace, ""));
        let ts_state = from_hex(&TS_STATE.replace(char::is_whitespace, ""));

        // Same parameters, so both sides derive the same contract address.
        assert_eq!(
            ts_parameters,
            parameters(&SLOT_ID, &key).as_ref(),
            "parameters layout drifted between Rust and TypeScript"
        );
        // Same state bytes, so the same signature covers the same message.
        assert_eq!(
            ts_state,
            slot_state(&SLOT_ID, &key, 1, b"sealed-manifest"),
            "state layout or signing message drifted between Rust and TypeScript"
        );
        // And the contract actually accepts what TypeScript produced.
        assert_eq!(
            validate(Parameters::from(ts_parameters), ts_state),
            ValidateResult::Valid
        );
    }

    #[test]
    fn accepts_a_state_signed_for_this_slot() {
        let key = signing_key();
        let state = slot_state(&SLOT_ID, &key, 1, b"sealed-manifest");
        assert_eq!(
            validate(parameters(&SLOT_ID, &key), state),
            ValidateResult::Valid
        );
    }

    #[test]
    fn rejects_a_tampered_payload() {
        let key = signing_key();
        let mut state = slot_state(&SLOT_ID, &key, 1, b"sealed-manifest");
        let last = state.len() - 1;
        state[last] ^= 0xff;
        assert_eq!(
            validate(parameters(&SLOT_ID, &key), state),
            ValidateResult::Invalid
        );
    }

    #[test]
    fn rejects_a_state_signed_by_another_farm() {
        let owner = signing_key();
        let impostor = SigningKey::from_bytes(&[43u8; 32]);
        let state = slot_state(&SLOT_ID, &impostor, 1, b"sealed-manifest");
        assert_eq!(
            validate(parameters(&SLOT_ID, &owner), state),
            ValidateResult::Invalid
        );
    }

    /// Two tickets on one farm share a verifying key, so the slot id binding in the
    /// signing message is the only thing stopping a cross-slot replay.
    #[test]
    fn rejects_a_state_signed_for_another_ticket() {
        let key = signing_key();
        let state = slot_state(&OTHER_SLOT_ID, &key, 1, b"sealed-manifest");
        assert_eq!(
            validate(parameters(&SLOT_ID, &key), state),
            ValidateResult::Invalid
        );
    }

    #[test]
    fn rejects_trailing_bytes_outside_the_signature() {
        let key = signing_key();
        let mut state = slot_state(&SLOT_ID, &key, 1, b"sealed-manifest");
        state.push(0);
        assert_eq!(
            validate(parameters(&SLOT_ID, &key), state),
            ValidateResult::Invalid
        );
    }

    #[test]
    fn rejects_empty_and_short_states() {
        let key = signing_key();
        let params = parameters(&SLOT_ID, &key);
        assert_eq!(validate(params.clone(), Vec::new()), ValidateResult::Invalid);
        assert_eq!(
            validate(params, vec![0u8; HEADER_LEN - 1]),
            ValidateResult::Invalid
        );
    }

    #[test]
    fn rejects_parameters_that_are_not_slot_id_plus_key() {
        let key = signing_key();
        let state = slot_state(&SLOT_ID, &key, 1, b"sealed-manifest");
        let err = SlotContract::validate_state(
            Parameters::from(SLOT_ID.to_vec()),
            State::from(state),
            RelatedContracts::default(),
        );
        assert!(err.is_err(), "32-byte parameters must not validate");
    }

    #[test]
    fn update_takes_a_higher_sequence_number() {
        let key = signing_key();
        let current = slot_state(&SLOT_ID, &key, 1, b"old");
        let next = slot_state(&SLOT_ID, &key, 2, b"new");

        let result = SlotContract::update_state(
            parameters(&SLOT_ID, &key),
            State::from(current),
            vec![UpdateData::State(State::from(next.clone()))],
        )
        .expect("a validly signed newer state is an update");

        assert_eq!(result.unwrap_valid().as_ref(), next.as_slice());
    }

    #[test]
    fn update_keeps_the_current_state_against_a_replay() {
        let key = signing_key();
        let current = slot_state(&SLOT_ID, &key, 5, b"current");
        let stale = slot_state(&SLOT_ID, &key, 4, b"stale");

        let result = SlotContract::update_state(
            parameters(&SLOT_ID, &key),
            State::from(current.clone()),
            vec![UpdateData::State(State::from(stale))],
        )
        .expect("a stale update is not an error, it just loses");

        assert_eq!(result.unwrap_valid().as_ref(), current.as_slice());
    }

    /// Same sequence number, different payload — the tie must not be won by the
    /// newcomer, or an old signed state could displace the current one on replay.
    #[test]
    fn update_refuses_to_swap_payloads_at_the_same_sequence() {
        let key = signing_key();
        let current = slot_state(&SLOT_ID, &key, 5, b"current");
        let sibling = slot_state(&SLOT_ID, &key, 5, b"sibling");

        let result = SlotContract::update_state(
            parameters(&SLOT_ID, &key),
            State::from(current.clone()),
            vec![UpdateData::State(State::from(sibling))],
        )
        .expect("same-seq update is not an error");

        assert_eq!(result.unwrap_valid().as_ref(), current.as_slice());
    }

    #[test]
    fn update_ignores_a_forged_state_and_keeps_the_current_one() {
        let key = signing_key();
        let impostor = SigningKey::from_bytes(&[44u8; 32]);
        let current = slot_state(&SLOT_ID, &key, 1, b"current");
        let forged = slot_state(&SLOT_ID, &impostor, 99, b"forged");

        let result = SlotContract::update_state(
            parameters(&SLOT_ID, &key),
            State::from(current.clone()),
            vec![UpdateData::State(State::from(forged))],
        )
        .expect("a forged update is dropped, not fatal");

        assert_eq!(result.unwrap_valid().as_ref(), current.as_slice());
    }

    #[test]
    fn update_onto_an_empty_slot_accepts_the_first_valid_state() {
        let key = signing_key();
        let first = slot_state(&SLOT_ID, &key, 1, b"first");

        let result = SlotContract::update_state(
            parameters(&SLOT_ID, &key),
            State::from(Vec::new()),
            vec![UpdateData::State(State::from(first.clone()))],
        )
        .expect("an empty slot takes the first valid state");

        assert_eq!(result.unwrap_valid().as_ref(), first.as_slice());
    }

    #[test]
    fn update_with_nothing_valid_anywhere_is_an_error() {
        let key = signing_key();
        let result = SlotContract::update_state(
            parameters(&SLOT_ID, &key),
            State::from(Vec::new()),
            vec![UpdateData::State(State::from(vec![0u8; HEADER_LEN + 4]))],
        );
        assert!(result.is_err(), "no valid state to hold must not succeed");
    }

    #[test]
    fn update_accepts_a_delta_carrying_a_whole_state() {
        let key = signing_key();
        let current = slot_state(&SLOT_ID, &key, 1, b"old");
        let next = slot_state(&SLOT_ID, &key, 2, b"new");

        let result = SlotContract::update_state(
            parameters(&SLOT_ID, &key),
            State::from(current),
            vec![UpdateData::Delta(StateDelta::from(next.clone()))],
        )
        .expect("deltas are whole states for a slot");

        assert_eq!(result.unwrap_valid().as_ref(), next.as_slice());
    }

    #[test]
    fn summary_is_the_sequence_number_and_drives_the_delta() {
        let key = signing_key();
        let params = parameters(&SLOT_ID, &key);
        let state = slot_state(&SLOT_ID, &key, 9, b"payload");

        let summary = SlotContract::summarize_state(params.clone(), State::from(state.clone()))
            .expect("summary");
        assert_eq!(summary.as_ref(), &9u64.to_le_bytes());

        let behind = SlotContract::get_state_delta(
            params.clone(),
            State::from(state.clone()),
            StateSummary::from(8u64.to_le_bytes().to_vec()),
        )
        .expect("delta for a peer that is behind");
        assert_eq!(behind.as_ref(), state.as_slice());

        let current = SlotContract::get_state_delta(
            params.clone(),
            State::from(state.clone()),
            summary,
        )
        .expect("delta for a peer that is current");
        assert!(current.as_ref().is_empty());

        let no_summary = SlotContract::get_state_delta(
            params,
            State::from(state.clone()),
            StateSummary::from(Vec::new()),
        )
        .expect("delta for a peer with no state at all");
        assert_eq!(no_summary.as_ref(), state.as_slice());
    }

    #[test]
    fn payload_ceiling_is_enforced_by_the_declared_length() {
        let key = signing_key();
        let payload = vec![0u8; MAX_PAYLOAD_LEN + 1];
        let state = slot_state(&SLOT_ID, &key, 1, &payload);
        assert_eq!(
            validate(parameters(&SLOT_ID, &key), state),
            ValidateResult::Invalid
        );
    }
}
