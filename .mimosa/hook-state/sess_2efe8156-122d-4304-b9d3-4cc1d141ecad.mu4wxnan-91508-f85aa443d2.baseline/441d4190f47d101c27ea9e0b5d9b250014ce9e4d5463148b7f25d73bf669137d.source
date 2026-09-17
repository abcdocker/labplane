import React from "react";
import classNames from "classnames";
import styles from "./notification.module.css";

interface NotificationProps {
  message: string;
  type: "success" | "error";
}

export const Notification: React.FC<NotificationProps> = ({ message, type }) => {
  return <div className={classNames(styles.notification, styles[type])}>{message}</div>;
};
