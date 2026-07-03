export class Group {

  static set(pref, id) {
    const master = pref[id];
    if (!master.group?.[0]) { return []; }

    const enabled = master.enabled;
    // only change state if different to avoid re-registering
    let ids = master.group?.map(i => `_${i}`).filter(i => pref[i]?.enabled === !enabled) || [];

    // remove duplicates
    ids = [...new Set(ids)];

    //  & set state of the group
   ids.forEach(i => {
    pref[i].enabled = enabled;
    // update DOM
    document.getElementById(i).classList.toggle('disabled', !enabled);
  });

    // return ids to register
    return ids;
  }
}