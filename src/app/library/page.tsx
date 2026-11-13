import { redirect } from "next/navigation";

/** The library opens on its stations. */
export default function LibraryPage() {
  redirect("/library/stations");
}
