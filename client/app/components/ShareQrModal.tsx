"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { User as UserIcon, X } from "lucide-react";
import Image from "next/image";
import QRCode from "react-qr-code";

interface ShareQrModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  profileUrl: string;
  avatarUrl?: string;
}

const ShareQrModal = ({
  open,
  onOpenChange,
  username,
  profileUrl,
  avatarUrl,
}: ShareQrModalProps) => {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[201] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-white p-6 shadow-lg focus:outline-none">
          <Dialog.Close
            type="button"
            className="absolute right-3 top-3 rounded-full p-1 text-megaweave-forest-dark/60 transition-colors hover:bg-primary-15 hover:text-megaweave-forest-dark"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>

          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-primary-15">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={`${username} avatar`}
                  width={48}
                  height={48}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserIcon className="h-6 w-6 text-megaweave-forest-dark" />
              )}
            </div>

            <Dialog.Title className="type-button-b1 font-bold text-megaweave-forest-dark">
              {username || "User Name"}
            </Dialog.Title>

            <Dialog.Description className="mt-2 whitespace-nowrap text-[12px] leading-tight text-primary-75">
              Scan QRCode to contact with others.
            </Dialog.Description>

            <div className="mt-4 flex w-full items-center justify-center rounded-xl bg-primary-15 p-4">
              {profileUrl ? (
                <QRCode
                  value={profileUrl}
                  size={168}
                  bgColor="transparent"
                  fgColor="#3b6232"
                  className="h-auto max-w-full"
                />
              ) : (
                <span className="type-body-t5 text-primary-75">
                  QRcode appears here
                </span>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ShareQrModal;
