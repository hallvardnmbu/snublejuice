export function initNearby(form) {
  const nearbyBtn = document.getElementById("toggleNearby");

  const nearbyDialog = document.getElementById("nearby");
  const nearbyRange = document.getElementById("nearbyRange");
  const nearbyValue = document.getElementById("nearbyValue");
  const nearbyApply = document.getElementById("applyNearby");
  const NEARBY_DEFAULT_M = 1000;

  const updateNearbyLabel = () => {
    if (nearbyValue && nearbyRange) nearbyValue.textContent = `${Math.round(nearbyRange.value)} m`;
  };

  // pos = geolocation position to activate, null to reset
  const setNearby = (pos, dist = NEARBY_DEFAULT_M) => {
    const active = !!pos;
    if (form.elements.latitude) form.elements.latitude.value = active ? pos.coords.latitude.toFixed(3) : "";
    if (form.elements.longitude) form.elements.longitude.value = active ? pos.coords.longitude.toFixed(3) : "";
    if (active && form.elements.distance) form.elements.distance.value = String(dist);
    if (!active && nearbyRange) {
      nearbyRange.value = NEARBY_DEFAULT_M;
      updateNearbyLabel();
    }
    nearbyBtn?.classList.toggle("changed", active);
    nearbyBtn?.setAttribute("aria-pressed", String(active));
  };

  nearbyRange?.addEventListener("input", updateNearbyLabel);

  nearbyBtn?.addEventListener("click", () => {
    // Active: reset
    if (nearbyBtn.classList.contains("changed")) {
      setNearby(null);
      window.fetchProducts({ page: 1 });
      return;
    }
    // Inactive: open the range dialog
    nearbyDialog?.showModal();
  });

  nearbyDialog?.addEventListener("click", (event) => {
    if (event.target === nearbyDialog) nearbyDialog.close();
  });

  nearbyApply?.addEventListener("click", () => {
    if (!("geolocation" in navigator)) {
      alert("Posisjonering støttes ikke i denne nettleseren.");
      return;
    }

    const km = Number(nearbyRange.value);
    nearbyApply.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        nearbyApply.disabled = false;
        setNearby(pos, km);
        nearbyDialog.close();
        window.fetchProducts({ page: 1 });
      },
      (err) => {
        nearbyApply.disabled = false;
        setNearby(null);
        nearbyDialog.close();
        alert(err.code === 1 ? "Du har ikke gitt tilgang til posisjon." : "Kunne ikke hente posisjonen din.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  });

  return { setNearby };
}
