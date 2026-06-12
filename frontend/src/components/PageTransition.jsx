import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/* Wraps child routes and replays a glass-like enter animation on every route change.
 * Uses a React key keyed off pathname so the wrapper unmounts/remounts. */
export default function PageTransition({ children }) {
  const location = useLocation();
  const [veil, setVeil] = useState(false);

  useEffect(() => {
    setVeil(true);
    const t = setTimeout(() => setVeil(false), 560);
    return () => clearTimeout(t);
  }, [location.pathname]);

  return (
    <>
      {veil && <div className="rb-page-veil" aria-hidden />}
      <div key={location.pathname} className="rb-page">
        {children}
      </div>
    </>
  );
}
