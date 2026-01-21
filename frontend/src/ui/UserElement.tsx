import styles from "./UserElement.module.css";
import type { UserInfo } from "jolli-common";
import type { ReactElement } from "react";

interface UserProps {
	userInfo: UserInfo;
	doLogout(): void;
}

export function UserElement({ userInfo, doLogout }: UserProps): ReactElement {
	return (
		<>
			<div className={styles.userInfo}>
				{userInfo.picture && (
					<img
						src={userInfo.picture}
						alt="Profile"
						className={styles.profileImage}
						referrerPolicy="no-referrer"
					/>
				)}
				<div>
					<div className={styles.name}>{userInfo.name}</div>
					<div className={styles.email}>{userInfo.email}</div>
				</div>
			</div>
			<button onClick={doLogout} className={styles.logoutButton}>
				Logout
			</button>
		</>
	);
}
