import { Redirect } from "expo-router";
import "../global.css";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Index() {
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) setRedirectTo("home");
      else setRedirectTo("login");
    };
    checkSession();
  }, []);

  if (!redirectTo) return null;

  return <Redirect href={redirectTo} />;
}
