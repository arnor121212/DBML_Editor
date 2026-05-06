import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function SignInButton() {
  return (
    <Button asChild size="sm" variant="outline">
      <Link to="/login">Sign in</Link>
    </Button>
  );
}
