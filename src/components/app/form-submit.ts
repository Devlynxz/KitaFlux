"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Submit a form to an action without React's automatic form reset.
 *
 * Passing a function to `<form action>` makes React reset every uncontrolled
 * field once the action settles -- whether or not it succeeded. For a form
 * that comes back with "Check the highlighted fields", that wipes exactly the
 * input the user now has to correct: the settings page would revert every edit
 * and show a TIN error next to the old, valid TIN.
 *
 * Dispatching from onSubmit inside a transition keeps `useActionState`'s
 * pending flag and return value, and leaves the fields as the user typed them.
 * Forms whose success path redirects are unaffected; forms that should clear on
 * success do it themselves.
 */
export function submitWithoutReset(dispatch: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(form));
  };
}
