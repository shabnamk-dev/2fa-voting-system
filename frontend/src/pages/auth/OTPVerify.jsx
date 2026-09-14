import React from "react";
import TwoFactorVerify from "./TwoFactorVerify";

export default function OTPVerify({ onOtpSuccess }) {
  return <TwoFactorVerify onAuthSuccess={onOtpSuccess} />;
}
