import styles from "./HeroBanner.module.css";

interface Props {
  chatRef: React.RefObject<HTMLDivElement>;
  onSendDefaultMessage: () => void;
}

const HeroBanner: React.FC<Props> = ({ chatRef, onSendDefaultMessage }) => {
  const handleDefaultReport = () => {
    onSendDefaultMessage();
    chatRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCustomReport = () => {
    chatRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className={styles.heroBanner}>
      <div className={styles.content}>
        <h1>Welcome to Timmy's Financial Report RAG</h1>
        <p>This app generates reports from user prompts to understand financial expenditure</p>
        <div className={styles.buttons}>
          <button className={`${styles.btn} ${styles.btnBlack}`} onClick={handleDefaultReport}>Default Report</button>
          <button className={`${styles.btn} ${styles.btnGrey}`} onClick={handleCustomReport}>Custom Report</button>
        </div>
      </div>
    </div>
  );
};

export default HeroBanner;
